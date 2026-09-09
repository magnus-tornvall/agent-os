import { claudeCode } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { Worktree, WorktreeRunResult } from "@ai-hero/sandcastle";
import { join } from "node:path";

export const PHASE_NAMES = ["implement", "review", "fix"] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

/** noSandbox() declines to pass --dangerously-skip-permissions and the host
 *  allowlist is not the agents' to widen, so the grant rides on the agent. */
const AGENT = claudeCode("claude-opus-5", {
  effort: "medium",
  permissionMode: "bypassPermissions",
});

export const REVIEW_CLEAN = "REVIEW CLEAN";
export const REVIEW_FINDINGS_POSTED = "REVIEW FINDINGS POSTED";

/** The sequence is fixed and identical in every repository, so iteration counts
 *  and signals are properties of the phase rather than of the target repo. */
export const PHASES: Record<
  PhaseName,
  { readonly maxIterations: number; readonly completionSignal: string[] }
> = {
  implement: { maxIterations: 3, completionSignal: ["IMPLEMENTATION COMPLETE"] },
  review: {
    maxIterations: 2,
    completionSignal: [REVIEW_CLEAN, REVIEW_FINDINGS_POSTED],
  },
  fix: { maxIterations: 2, completionSignal: ["FIXES COMPLETE"] },
};

export async function runPhase(args: {
  readonly name: PhaseName;
  readonly worktree: Worktree;
  readonly promptFile: string;
  readonly promptArgs: Record<string, string | number>;
  readonly logDir: string;
  readonly runId: string;
}): Promise<WorktreeRunResult> {
  const phase = PHASES[args.name];
  const logFilePath = join(args.logDir, `${args.runId}-${args.name}.log`);

  const result = await args.worktree.run({
    agent: AGENT,
    sandbox: noSandbox(),
    name: args.name,
    promptFile: args.promptFile,
    promptArgs: args.promptArgs,
    maxIterations: phase.maxIterations,
    completionSignal: phase.completionSignal,
    logging: { type: "file", path: logFilePath },
  });

  console.log(
    `[${args.name}] ${result.iterations.length} iteration(s), ` +
      `${result.commits.length} commit(s), ` +
      `signal=${result.completionSignal ?? "none"}, ` +
      `log=${result.logFilePath ?? logFilePath}`,
  );
  return result;
}
