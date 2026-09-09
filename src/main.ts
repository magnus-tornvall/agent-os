import { createWorktree } from "@ai-hero/sandcastle";
import type { Worktree } from "@ai-hero/sandcastle";
import { join } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { forge, type Issue, type PullRequest } from "./github.ts";
import { runPhase, type PhaseResult } from "./phases.ts";
import { sh, succeeds } from "./shell.ts";

type Forge = ReturnType<typeof forge>;

/** What the run reports, and what its exit code is read off. */
type Outcome =
  | "no-commits"
  | "clean-review"
  | "fixed"
  | "conform-inconclusive"
  | "review-inconclusive";

/** What every phase shares, assembled once the worktree they run in exists. */
type Run = {
  readonly gh: Forge;
  readonly config: Config;
  readonly issue: Issue;
  readonly branch: string;
  readonly baseBranch: string;
  readonly worktree: Worktree;
  readonly logDir: string;
  readonly runId: string;
};

function readIssueNumber(argv: readonly string[]): number {
  const issueNumber = Number(argv[2]);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("usage: agentflow <issue-number>");
  }
  return issueNumber;
}

async function findRepositoryRoot(cwd: string): Promise<string> {
  return sh("git", ["rev-parse", "--show-toplevel"], cwd).catch(() => {
    throw new Error(`${cwd} is not inside a git repository`);
  });
}

async function currentBranch(repoRoot: string): Promise<string> {
  return sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
}

function newRunId(issueNumber: number): string {
  return `issue-${issueNumber}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
}

/** gh pr create fails late and confusingly when the base is local-only. */
async function refuseUnlessBaseIsOnOrigin(
  repoRoot: string,
  baseBranch: string,
): Promise<void> {
  const onOrigin = await succeeds(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", baseBranch],
    repoRoot,
  );
  if (!onOrigin) {
    throw new Error(
      `base branch "${baseBranch}" is not on origin; push it before running`,
    );
  }
}

async function refuseIfBranchExistsLocally(
  repoRoot: string,
  branch: string,
): Promise<void> {
  const exists = await succeeds(
    "git",
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    repoRoot,
  );
  if (exists) {
    throw new Error(
      `branch "${branch}" already exists locally; delete it and run again`,
    );
  }
}

async function refuseIfBranchExistsOnOrigin(
  repoRoot: string,
  branch: string,
): Promise<void> {
  const exists = await succeeds(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", branch],
    repoRoot,
  );
  if (exists) {
    throw new Error(
      `branch "${branch}" already exists on origin; delete it and run again`,
    );
  }
}

async function refuseIfPullRequestIsOpen(
  gh: Forge,
  branch: string,
): Promise<void> {
  const existingPr = await gh.openPullRequestFor(branch);
  if (existingPr !== undefined) {
    throw new Error(`pull request #${existingPr} is already open for "${branch}"`);
  }
}

function refuseUnlessIssueIsOpen(issue: Issue): void {
  if (issue.state !== "OPEN") {
    throw new Error(
      `issue #${issue.number} is ${issue.state.toLowerCase()}, not open`,
    );
  }
}

async function refuseUnlessIssueIsOursToClaim(
  gh: Forge,
  issue: Issue,
): Promise<void> {
  const viewer = await gh.viewerLogin();
  const otherAssignees = issue.assignees
    .map((assignee) => assignee.login)
    .filter((login) => login !== viewer);
  if (otherAssignees.length > 0) {
    throw new Error(
      `issue #${issue.number} is assigned to ${otherAssignees.join(", ")}, not to ${viewer}`,
    );
  }
}

function announceRun(args: {
  readonly repoRoot: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly issue: Issue;
}): void {
  console.log(`issue #${args.issue.number}: ${args.issue.title}`);
  console.log(`repository ${args.repoRoot}`);
  console.log(`base ${args.baseBranch}, branch ${args.branch}`);
}

async function claimIssue(gh: Forge, issueNumber: number): Promise<void> {
  await gh.claimIssue(issueNumber);
  console.log("claimed");
}

async function openWorktree(args: {
  readonly repoRoot: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly copyToWorktree: string[];
}): Promise<Worktree> {
  const worktree = await createWorktree({
    cwd: args.repoRoot,
    branchStrategy: {
      type: "branch",
      branch: args.branch,
      baseBranch: args.baseBranch,
    },
    copyToWorktree: args.copyToWorktree,
  });
  console.log(`worktree ${worktree.worktreePath}`);
  return worktree;
}

async function closeWorktree(worktree: Worktree): Promise<void> {
  const { preservedWorktreePath } = await worktree.close();
  if (preservedWorktreePath !== undefined) {
    console.log(`worktree preserved (dirty): ${preservedWorktreePath}`);
  }
}

async function implementIssue(run: Run): Promise<PhaseResult> {
  return runPhase({
    name: "implement",
    phase: run.config.phases.implement,
    worktree: run.worktree,
    promptArgs: {
      ISSUE_NUMBER: run.issue.number,
      ISSUE_TITLE: run.issue.title,
      ISSUE_BODY: run.issue.body,
      ISSUE_URL: run.issue.url,
    },
    logDir: run.logDir,
    runId: run.runId,
  });
}

async function openPullRequest(run: Run): Promise<PullRequest> {
  await sh("git", ["push", "-u", "origin", run.branch], run.worktree.worktreePath);
  const pr = await run.gh.createPullRequest({
    branch: run.branch,
    baseBranch: run.baseBranch,
    issue: run.issue,
  });
  console.log(`pull request #${pr.number} ${pr.url}`);
  return pr;
}

/** What a phase judging an open pull request against its issue needs to read. */
function judgementPromptArgs(
  run: Run,
  pr: PullRequest,
): Record<string, string | number> {
  return {
    PR_NUMBER: pr.number,
    PR_URL: pr.url,
    BASE_BRANCH: run.baseBranch,
    ISSUE_NUMBER: run.issue.number,
    ISSUE_TITLE: run.issue.title,
    ISSUE_BODY: run.issue.body,
  };
}

/** The judgement is informational, so only a failure to post it — never what it
 *  found — reaches the outcome. */
async function judgeScope(run: Run, pr: PullRequest): Promise<boolean> {
  const conformed = await runPhase({
    name: "conform",
    phase: run.config.phases.conform,
    worktree: run.worktree,
    promptArgs: judgementPromptArgs(run, pr),
    logDir: run.logDir,
    runId: run.runId,
  });
  if (conformed.completionSignal !== undefined) {
    return true;
  }
  console.log(
    `conform phase ended without a completion signal; whether a scope ` +
      `judgement reached pull request #${pr.number} is unknown`,
  );
  return false;
}

/** Each phase here is a fresh agent: the reviewer has no memory of writing the
 *  code under review, and the fix phase is given only the pull request, because
 *  the reviewer posted its findings there itself. */
async function reviewAndFix(run: Run, pr: PullRequest): Promise<Outcome> {
  const review = run.config.phases.review;
  const reviewed = await runPhase({
    name: "review",
    phase: review,
    worktree: run.worktree,
    promptArgs: judgementPromptArgs(run, pr),
    logDir: run.logDir,
    runId: run.runId,
  });

  if (reviewed.completionSignal === review.cleanSignal) {
    return (await judgeScope(run, pr)) ? "clean-review" : "conform-inconclusive";
  }

  if (reviewed.completionSignal === review.findingsSignal) {
    const fixed = await runPhase({
      name: "fix",
      phase: run.config.phases.fix,
      worktree: run.worktree,
      promptArgs: {
        PR_NUMBER: pr.number,
        PR_URL: pr.url,
        BASE_BRANCH: run.baseBranch,
      },
      logDir: run.logDir,
      runId: run.runId,
    });

    if (fixed.commits.length > 0) {
      await sh("git", ["push"], run.worktree.worktreePath);
    }
    return (await judgeScope(run, pr)) ? "fixed" : "conform-inconclusive";
  }

  /** Neither signal fired, so whether findings were posted is unknown, and a fix
   *  phase run on that guess is worse than none. */
  console.log(
    `review phase ended without a completion signal; ` +
      `pull request #${pr.number} is open and needs a human`,
  );
  return "review-inconclusive";
}

async function main(): Promise<Outcome> {
  const issueNumber = readIssueNumber(process.argv);
  const repoRoot = await findRepositoryRoot(process.cwd());
  const config = await loadConfig(repoRoot);
  const gh = forge(repoRoot);
  const branch = `agent/issue-${issueNumber}`;
  const baseBranch = await currentBranch(repoRoot);

  await refuseUnlessBaseIsOnOrigin(repoRoot, baseBranch);
  await refuseIfBranchExistsLocally(repoRoot, branch);
  await refuseIfBranchExistsOnOrigin(repoRoot, branch);
  await refuseIfPullRequestIsOpen(gh, branch);
  const issue = await gh.readIssue(issueNumber);
  refuseUnlessIssueIsOpen(issue);
  await refuseUnlessIssueIsOursToClaim(gh, issue);

  const runId = newRunId(issueNumber);

  announceRun({ repoRoot, branch, baseBranch, issue });
  await claimIssue(gh, issueNumber);

  const worktree = await openWorktree({
    repoRoot,
    branch,
    baseBranch,
    copyToWorktree: config.copyToWorktree,
  });
  const run: Run = {
    gh,
    config,
    issue,
    branch,
    baseBranch,
    worktree,
    runId,
    logDir: join(repoRoot, ".sandcastle", "logs"),
  };

  try {
    const implemented = await implementIssue(run);

    // The gate, and the whole gate.
    if (implemented.commits.length === 0) {
      console.log("implement phase produced no commits — no pull request opened");
      return "no-commits";
    }

    const pr = await openPullRequest(run);
    return await reviewAndFix(run, pr);
  } finally {
    await closeWorktree(worktree);
  }
}

const outcome = await main().catch((error: unknown) => {
  console.error(
    `agentflow: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

console.log(`done: ${outcome}`);
if (outcome !== "clean-review" && outcome !== "fixed") {
  process.exitCode = 1;
}
