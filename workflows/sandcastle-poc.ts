/**
 * POC: drive one GitHub issue to a review-ready PR in a single unattended run.
 *
 *   node workflows/sandcastle-poc.ts <issue-number>
 *
 * claim -> implement -> PR -> review -> post findings -> read them back -> fix -> ping.
 *
 * The point is to evaluate the sandcastle stack, so the run emits per-stage
 * evidence (wall time, iterations, commit shas, comment ids, log path) rather
 * than leaving the finished PR as the only record.
 *
 * Two invariants hold the shape:
 *   - Every tracker and PR state change happens in this file. The agents are
 *     told not to touch GitHub and are given what they would otherwise fetch.
 *   - Each stage is a fresh agent. resumeSession is incompatible with
 *     maxIterations > 1, so the prompts stand alone by construction and the
 *     reviewer has no memory of writing the code under review.
 *
 * Nothing resumes this. One invocation performs the whole sequence and exits.
 */

import { claudeCode, createWorktree } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { Worktree, WorktreeRunResult } from "@ai-hero/sandcastle";
import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** noSandbox() declines to pass --dangerously-skip-permissions and the host
 *  allowlist is not the agents' to widen, so the grant rides on the agent. */
const AGENT = claudeCode("claude-opus-5", {
  effort: "medium",
  permissionMode: "bypassPermissions",
});

/** promptFile resolves against process.cwd(), not the worktree, so the driver
 *  must be invoked from the repo root and prompt paths are relative to it. */
const PROMPT_DIR = "workflows/prompts";

const RECORD_DIR = ".scratch";
const RECORD_FILE = "sandcastle-poc-runs.jsonl";

/** Gitignored inside the worktree, so the reviewer's report never reaches the PR. */
const FINDINGS_PATH = ".scratch/findings.json";

type Issue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
};

type Finding = {
  readonly title: string;
  readonly file?: string;
  readonly line?: number;
  readonly detail: string;
};

type ReadBackComment = {
  readonly id: number;
  readonly author: string;
  readonly body: string;
};

type StageRecord = {
  readonly stage: string;
  readonly wallMs: number;
  readonly iterations: number;
  readonly commits: string[];
  readonly commentIds: number[];
  readonly completionSignal?: string;
  readonly logFilePath?: string;
};

type RunRecord = {
  readonly runId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly issue: number;
  readonly branch: string;
  readonly baseBranch: string;
  readonly prNumber?: number;
  readonly prUrl?: string;
  readonly outcome: string;
  readonly stages: StageRecord[];
};

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------

async function sh(cmd: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

const repoRoot = process.cwd();

const git = (args: string[], cwd: string = repoRoot) => sh("git", args, cwd);
const gh = (args: string[]) => sh("gh", args, repoRoot);

/** macOS-only, and the whole handoff — there is no reviewer to add. */
async function ping(message: string): Promise<void> {
  const escaped = message.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  await sh(
    "osascript",
    ["-e", `display notification "${escaped}" with title "sandcastle poc"`],
    repoRoot,
  ).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// GitHub, driver-only
// ---------------------------------------------------------------------------

async function readIssue(number: number): Promise<Issue> {
  const raw = await gh([
    "issue",
    "view",
    String(number),
    "--json",
    "number,title,body,url",
  ]);
  return JSON.parse(raw) as Issue;
}

async function claimIssue(number: number): Promise<void> {
  await gh(["issue", "edit", String(number), "--add-assignee", "@me"]);
}

async function openPullRequest(args: {
  readonly branch: string;
  readonly baseBranch: string;
  readonly issue: Issue;
}): Promise<{ number: number; url: string }> {
  const body = [
    `Closes #${args.issue.number}.`,
    "",
    "Opened unattended by `workflows/sandcastle-poc.ts`. The review comments on",
    "this PR were written by a second agent with no memory of the first, and read",
    "back from GitHub before the fixes were applied.",
  ].join("\n");

  const url = await gh([
    "pr",
    "create",
    "--base",
    args.baseBranch,
    "--head",
    args.branch,
    "--title",
    args.issue.title,
    "--body",
    body,
  ]);
  const number = Number(url.trim().split("/").pop());
  if (!Number.isInteger(number)) {
    throw new Error(`could not read a PR number out of "${url}"`);
  }
  return { number, url: url.trim() };
}

/** gh pr comment reports a URL; the API reports the id the run record needs. */
async function postComment(
  nameWithOwner: string,
  prNumber: number,
  body: string,
): Promise<number> {
  const raw = await gh([
    "api",
    `repos/${nameWithOwner}/issues/${prNumber}/comments`,
    "-f",
    `body=${body}`,
    "--jq",
    ".id",
  ]);
  return Number(raw);
}

/** The read path is itself under evaluation, so the fix stage is fed from
 *  GitHub rather than from the findings still sitting in memory. */
async function readComments(
  nameWithOwner: string,
  prNumber: number,
): Promise<ReadBackComment[]> {
  const raw = await gh([
    "api",
    "--paginate",
    `repos/${nameWithOwner}/issues/${prNumber}/comments`,
  ]);
  const parsed = JSON.parse(raw) as {
    id: number;
    body: string;
    user: { login: string };
  }[];
  return parsed.map((comment) => ({
    id: comment.id,
    author: comment.user.login,
    body: comment.body,
  }));
}

function renderFinding(finding: Finding, index: number, total: number): string {
  const where =
    finding.file === undefined
      ? ""
      : `\n\n\`${finding.file}${finding.line === undefined ? "" : `:${finding.line}`}\``;
  return [
    `**Review finding ${index + 1} of ${total} — ${finding.title}**${where}`,
    "",
    finding.detail,
    "",
    "<sub>Posted by `workflows/sandcastle-poc.ts` on behalf of the review stage.</sub>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// stages
// ---------------------------------------------------------------------------

const stages: StageRecord[] = [];

async function runStage(args: {
  readonly name: string;
  readonly worktree: Worktree;
  readonly promptFile: string;
  readonly promptArgs: Record<string, string | number>;
  readonly maxIterations: number;
  readonly completionSignal: string;
  readonly runId: string;
}): Promise<WorktreeRunResult> {
  const logFilePath = join(
    repoRoot,
    ".sandcastle",
    "logs",
    `${args.runId}-${args.name}.log`,
  );
  const startedAt = Date.now();
  const result = await args.worktree.run({
    agent: AGENT,
    sandbox: noSandbox(),
    name: args.name,
    promptFile: join(PROMPT_DIR, args.promptFile),
    promptArgs: args.promptArgs,
    maxIterations: args.maxIterations,
    completionSignal: args.completionSignal,
    logging: { type: "file", path: logFilePath },
  });

  stages.push({
    stage: args.name,
    wallMs: Date.now() - startedAt,
    iterations: result.iterations.length,
    commits: result.commits.map((commit) => commit.sha),
    commentIds: [],
    completionSignal: result.completionSignal,
    logFilePath: result.logFilePath ?? logFilePath,
  });

  console.log(
    `[${args.name}] ${result.iterations.length} iteration(s), ` +
      `${result.commits.length} commit(s), ` +
      `signal=${result.completionSignal ?? "none"}, log=${logFilePath}`,
  );
  return result;
}

async function readFindings(worktreePath: string): Promise<Finding[]> {
  const path = join(worktreePath, FINDINGS_PATH);
  const raw = await readFile(path, "utf8").catch(() => {
    throw new Error(`review stage wrote no findings file at ${path}`);
  });
  const parsed = JSON.parse(raw) as { findings?: Finding[] };
  if (!Array.isArray(parsed.findings)) {
    throw new Error(`findings file at ${path} has no "findings" array`);
  }
  return parsed.findings;
}

async function writeRunRecord(record: RunRecord): Promise<void> {
  const dir = join(repoRoot, RECORD_DIR);
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, RECORD_FILE), `${JSON.stringify(record)}\n`, "utf8");
  console.log(`run record appended to ${join(dir, RECORD_FILE)}`);
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

const issueNumber = Number(process.argv[2]);
if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
  throw new Error("usage: node workflows/sandcastle-poc.ts <issue-number>");
}

const runId = `issue-${issueNumber}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
const startedAt = new Date().toISOString();
const branch = `agent/issue-${issueNumber}`;
const baseBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);

/** gh pr create fails late and confusingly when the base is local-only. */
await git(["ls-remote", "--exit-code", "--heads", "origin", baseBranch]).catch(() => {
  throw new Error(
    `base branch "${baseBranch}" is not on origin; push it before running`,
  );
});

const nameWithOwner = await gh([
  "repo",
  "view",
  "--json",
  "nameWithOwner",
  "--jq",
  ".nameWithOwner",
]);

const issue = await readIssue(issueNumber);
console.log(`issue #${issue.number}: ${issue.title}`);
console.log(`base ${baseBranch}, branch ${branch}, repo ${nameWithOwner}`);

await claimIssue(issueNumber);
console.log("claimed");

const worktree = await createWorktree({
  branchStrategy: { type: "branch", branch, baseBranch },
});
console.log(`worktree ${worktree.worktreePath}`);

let outcome = "failed";
let prNumber: number | undefined;
let prUrl: string | undefined;

try {
  // --- implement ---------------------------------------------------------
  const implemented = await runStage({
    name: "implement",
    worktree,
    promptFile: "implement.md",
    promptArgs: {
      ISSUE_NUMBER: issue.number,
      ISSUE_TITLE: issue.title,
      ISSUE_BODY: issue.body,
    },
    maxIterations: 3,
    completionSignal: "IMPLEMENTATION COMPLETE",
    runId,
  });

  // The gate, and the whole gate.
  if (implemented.commits.length === 0) {
    outcome = "no-commits";
    console.log("implement stage produced no commits — no PR opened");
    await ping(`Issue #${issueNumber}: implement produced no commits. No PR.`);
  } else {
    await git(["push", "-u", "origin", branch], worktree.worktreePath);
    const pr = await openPullRequest({ branch, baseBranch, issue });
    prNumber = pr.number;
    prUrl = pr.url;
    console.log(`PR #${prNumber} ${prUrl}`);

    // --- review --------------------------------------------------------
    await mkdir(join(worktree.worktreePath, RECORD_DIR), { recursive: true });
    await runStage({
      name: "review",
      worktree,
      promptFile: "review.md",
      promptArgs: {
        PR_NUMBER: prNumber,
        BASE_BRANCH: baseBranch,
        ISSUE_NUMBER: issue.number,
        ISSUE_TITLE: issue.title,
        ISSUE_BODY: issue.body,
        FINDINGS_PATH,
      },
      maxIterations: 2,
      completionSignal: "REVIEW COMPLETE",
      runId,
    });

    const findings = await readFindings(worktree.worktreePath);
    console.log(`${findings.length} finding(s)`);

    const commentIds: number[] = [];
    for (const [index, finding] of findings.entries()) {
      commentIds.push(
        await postComment(
          nameWithOwner,
          prNumber,
          renderFinding(finding, index, findings.length),
        ),
      );
    }
    const reviewStage = stages.at(-1);
    if (reviewStage !== undefined) {
      stages[stages.length - 1] = { ...reviewStage, commentIds };
    }
    console.log(`posted comment ids: ${commentIds.join(", ") || "none"}`);

    if (findings.length === 0) {
      outcome = "clean-review";
      await ping(`PR #${prNumber} reviewed clean. Your turn.`);
    } else {
      // --- fix -------------------------------------------------------
      const readBack = await readComments(nameWithOwner, prNumber);
      console.log(`read back ${readBack.length} comment(s) from GitHub`);

      const fixed = await runStage({
        name: "fix",
        worktree,
        promptFile: "fix.md",
        promptArgs: {
          PR_NUMBER: prNumber,
          FINDINGS: readBack
            .map((comment) => `### Comment ${comment.id}\n\n${comment.body}`)
            .join("\n\n---\n\n"),
        },
        maxIterations: 2,
        completionSignal: "FIXES COMPLETE",
        runId,
      });

      if (fixed.commits.length > 0) {
        await git(["push"], worktree.worktreePath);
      }
      outcome = "fixed";
      await ping(
        `PR #${prNumber}: ${findings.length} finding(s) posted, ` +
          `${fixed.commits.length} fix commit(s) pushed. Review me.`,
      );
    }
  }
} finally {
  await writeRunRecord({
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    issue: issueNumber,
    branch,
    baseBranch,
    prNumber,
    prUrl,
    outcome,
    stages,
  });
  const { preservedWorktreePath } = await worktree.close();
  if (preservedWorktreePath !== undefined) {
    console.log(`worktree preserved (dirty): ${preservedWorktreePath}`);
  }
}

console.log(`done: ${outcome}`);
