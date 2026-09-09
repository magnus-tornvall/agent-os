/**
 * agentflow — drive one GitHub issue to a review-ready pull request in a single
 * unattended run.
 *
 *   agentflow <issue-number>
 *
 * The repository being driven is the one containing the invocation directory,
 * found with `git rev-parse --show-toplevel`. It supplies its own prompts and
 * declares what is copied into the worktree, through an `agentflow.toml` at its
 * root. There are no defaults: a repository without that file cannot be driven.
 *
 * claim -> implement -> pull request -> review -> fix.
 *
 * Two invariants hold the shape:
 *   - Issue claim, issue validation, pull request creation and pushes happen
 *     here. Findings are the exception: the reviewing agent posts those itself,
 *     and the fix phase reads them back through a prompt expansion.
 *   - Each phase is a fresh agent. The reviewer has no memory of writing the
 *     code under review.
 *
 * Nothing resumes this. One invocation performs the whole sequence and exits.
 */

import { createWorktree } from "@ai-hero/sandcastle";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { forge } from "./github.ts";
import { REVIEW_CLEAN, REVIEW_FINDINGS_POSTED, runPhase } from "./phases.ts";
import { sh, succeeds } from "./shell.ts";

async function main(): Promise<string> {
  const issueNumber = Number(process.argv[2]);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("usage: agentflow <issue-number>");
  }

  const repoRoot = await sh(
    "git",
    ["rev-parse", "--show-toplevel"],
    process.cwd(),
  ).catch(() => {
    throw new Error(`${process.cwd()} is not inside a git repository`);
  });

  const git = (args: string[], cwd: string = repoRoot) => sh("git", args, cwd);
  const gh = forge(repoRoot);

  const config = await loadConfig(repoRoot);
  const branch = `agent/issue-${issueNumber}`;
  const baseBranch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);

  // -------------------------------------------------------------------------
  // refusals — all of them before anything is mutated
  // -------------------------------------------------------------------------

  /** gh pr create fails late and confusingly when the base is local-only. */
  const baseOnOrigin = await succeeds(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", baseBranch],
    repoRoot,
  );
  if (!baseOnOrigin) {
    throw new Error(
      `base branch "${baseBranch}" is not on origin; push it before running`,
    );
  }

  const branchIsLocal = await succeeds(
    "git",
    ["rev-parse", "--verify", `refs/heads/${branch}`],
    repoRoot,
  );
  if (branchIsLocal) {
    throw new Error(
      `branch "${branch}" already exists locally; delete it and run again`,
    );
  }

  const branchIsRemote = await succeeds(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", branch],
    repoRoot,
  );
  if (branchIsRemote) {
    throw new Error(
      `branch "${branch}" already exists on origin; delete it and run again`,
    );
  }

  const existingPr = await gh.openPullRequestFor(branch);
  if (existingPr !== undefined) {
    throw new Error(`pull request #${existingPr} is already open for "${branch}"`);
  }

  const issue = await gh.readIssue(issueNumber);
  if (issue.state !== "OPEN") {
    throw new Error(
      `issue #${issueNumber} is ${issue.state.toLowerCase()}, not open`,
    );
  }

  const viewer = await gh.viewerLogin();
  const otherAssignees = issue.assignees
    .map((assignee) => assignee.login)
    .filter((login) => login !== viewer);
  if (otherAssignees.length > 0) {
    throw new Error(
      `issue #${issueNumber} is assigned to ${otherAssignees.join(", ")}, not to ${viewer}`,
    );
  }

  // -------------------------------------------------------------------------
  // the run
  // -------------------------------------------------------------------------

  const runId = `issue-${issueNumber}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`;
  const logDir = join(repoRoot, ".sandcastle", "logs");

  console.log(`issue #${issue.number}: ${issue.title}`);
  console.log(`repository ${repoRoot}`);
  console.log(`base ${baseBranch}, branch ${branch}`);

  await gh.claimIssue(issueNumber);
  console.log("claimed");

  const worktree = await createWorktree({
    cwd: repoRoot,
    branchStrategy: { type: "branch", branch, baseBranch },
    copyToWorktree: config.copyToWorktree,
  });
  console.log(`worktree ${worktree.worktreePath}`);

  let outcome = "failed";

  try {
    const implemented = await runPhase({
      name: "implement",
      worktree,
      promptFile: config.prompts.implement,
      promptArgs: {
        ISSUE_NUMBER: issue.number,
        ISSUE_TITLE: issue.title,
        ISSUE_BODY: issue.body,
        ISSUE_URL: issue.url,
      },
      logDir,
      runId,
    });

    // The gate, and the whole gate.
    if (implemented.commits.length === 0) {
      outcome = "no-commits";
      console.log("implement phase produced no commits — no pull request opened");
    } else {
      await git(["push", "-u", "origin", branch], worktree.worktreePath);
      const pr = await gh.createPullRequest({ branch, baseBranch, issue });
      console.log(`pull request #${pr.number} ${pr.url}`);

      const reviewed = await runPhase({
        name: "review",
        worktree,
        promptFile: config.prompts.review,
        promptArgs: {
          PR_NUMBER: pr.number,
          PR_URL: pr.url,
          BASE_BRANCH: baseBranch,
          ISSUE_NUMBER: issue.number,
          ISSUE_TITLE: issue.title,
          ISSUE_BODY: issue.body,
        },
        logDir,
        runId,
      });

      if (reviewed.completionSignal === REVIEW_CLEAN) {
        outcome = "clean-review";
      } else if (reviewed.completionSignal === REVIEW_FINDINGS_POSTED) {
        const fixed = await runPhase({
          name: "fix",
          worktree,
          promptFile: config.prompts.fix,
          promptArgs: {
            PR_NUMBER: pr.number,
            PR_URL: pr.url,
            BASE_BRANCH: baseBranch,
          },
          logDir,
          runId,
        });

        if (fixed.commits.length > 0) {
          await git(["push"], worktree.worktreePath);
        }
        outcome = "fixed";
      } else {
        /** Neither signal fired, so whether findings were posted is unknown,
         *  and a fix phase run on that guess is worse than none. */
        outcome = "review-inconclusive";
        console.log(
          `review phase ended without a completion signal; ` +
            `pull request #${pr.number} is open and needs a human`,
        );
      }
    }
  } finally {
    const { preservedWorktreePath } = await worktree.close();
    if (preservedWorktreePath !== undefined) {
      console.log(`worktree preserved (dirty): ${preservedWorktreePath}`);
    }
  }

  return outcome;
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
