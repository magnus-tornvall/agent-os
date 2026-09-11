import { createWorktree } from "@ai-hero/sandcastle";
import type { Worktree } from "@ai-hero/sandcastle";
import { join } from "node:path";
import { loadConfig, type Config } from "./config.ts";
import { forge, type PullRequest } from "./github.ts";
import {
  issueProviderFor,
  parseIssueRef,
  type Issue,
  type IssueProvider,
} from "./issues.ts";
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
  readonly issues: IssueProvider;
  readonly config: Config;
  readonly issue: Issue;
  readonly branch: string;
  readonly baseBranch: string;
  readonly worktree: Worktree;
  readonly logDir: string;
  readonly runId: string;
};

async function main(): Promise<Outcome> {
  const repoRoot = await findRepositoryRoot(process.cwd());
  const config = await loadConfig(repoRoot);

  /** Which provider the run reads its issue from is decided here, from the
   *  prefix on the argument against what the config declares, and nothing
   *  downstream knows which one it got. */
  const { number: issueNumber, provider } = parseIssueRef(
    process.argv[2],
    config.issues,
  );
  const issues = issueProviderFor(provider, repoRoot);

  try {
    const gh = forge(repoRoot);
    const branch = `agent/issue-${provider.prefix}-${issueNumber}`;
    const baseBranch = await currentBranch(repoRoot);

    await refuseUnlessBaseIsOnOrigin(repoRoot, baseBranch);
    await refuseIfBranchExistsLocally(repoRoot, branch);
    await refuseIfBranchExistsOnOrigin(repoRoot, branch);
    await refuseIfPullRequestIsOpen(gh, branch);
    const issue = await issues.readIssue(issueNumber);
    refuseUnlessIssueIsOpen(issue);
    await refuseUnlessIssueIsOursToClaim(issues, issue);

    const runId = newRunId(issue);

    announceRun({ repoRoot, branch, baseBranch, issue });
    await claimIssue(issues, issue);

    const worktree = await openWorktree({
      repoRoot,
      branch,
      baseBranch,
      copyToWorktree: config.copyToWorktree,
    });
    const run: Run = {
      gh,
      issues,
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
  } finally {
    /** A provider may hold a server open, and an unclosed one keeps the run
     *  from exiting however it ended. */
    await issues.close();
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

async function findRepositoryRoot(cwd: string): Promise<string> {
  return sh("git", ["rev-parse", "--show-toplevel"], cwd).catch(() => {
    throw new Error(`${cwd} is not inside a git repository`);
  });
}

async function currentBranch(repoRoot: string): Promise<string> {
  return sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
}

function newRunId(issue: Issue): string {
  const when = new Date().toISOString().replaceAll(/[:.]/g, "-");
  return `issue-${issue.ref.replace(":", "-")}-${when}`;
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
  if (!issue.open) {
    throw new Error(`issue ${issue.ref} is ${issue.state}, not open`);
  }
}

async function refuseUnlessIssueIsOursToClaim(
  issues: IssueProvider,
  issue: Issue,
): Promise<void> {
  const claimant = await issues.claimant();
  const others = issue.assignees.filter((assignee) => assignee !== claimant);
  if (others.length > 0) {
    throw new Error(
      `issue ${issue.ref} is assigned to ${others.join(", ")}, not to ${claimant}`,
    );
  }
}

function announceRun(args: {
  readonly repoRoot: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly issue: Issue;
}): void {
  console.log(`issue ${args.issue.ref}: ${args.issue.title}`);
  console.log(`repository ${args.repoRoot}`);
  console.log(`base ${args.baseBranch}, branch ${args.branch}`);
}

async function claimIssue(issues: IssueProvider, issue: Issue): Promise<void> {
  await issues.claimIssue(issue.number);
  console.log(`claimed as ${await issues.claimant()}`);
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
    agent: run.config.agent,
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
    title: run.issue.title,
    issueReference: run.issues.pullRequestReference(run.issue),
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
    agent: run.config.agent,
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
    agent: run.config.agent,
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
      agent: run.config.agent,
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
