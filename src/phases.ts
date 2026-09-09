import { claudeCode } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { Worktree, WorktreeRunResult } from "@ai-hero/sandcastle";
import { join } from "node:path";

export const PHASE_NAMES = ["implement", "review", "fix"] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

/** claudeCode's own union. Sandcastle's five other agent factories do not share
 *  it, which is one reason the agent kind is not configurable. */
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export type Effort = (typeof EFFORTS)[number];

export type PhaseConfig = {
  /** Absolute, because sandcastle resolves promptFile against process.cwd(). */
  readonly prompt: string;
  readonly model: string;
  readonly effort: Effort;
  readonly maxIterations: number;
  /** Every signal that stops this phase's loop: two on review, one elsewhere. */
  readonly completionSignals: readonly string[];
};

/** The driver branches on which of review's two signals came back, so each is
 *  named rather than read out of a position. */
export type ReviewPhaseConfig = PhaseConfig & {
  readonly findingsSignal: string;
  readonly cleanSignal: string;
};

/** What each optional configuration key falls back to. The sequence is fixed and
 *  identical in every repository, so these are properties of the phase rather
 *  than of the target repo, and a repository declaring only its prompt paths
 *  runs on exactly these. */
type PhaseDefaults = {
  readonly model: string;
  readonly effort: Effort;
  readonly maxIterations: number;
  readonly completionSignal: string;
};

export const PHASE_DEFAULTS: {
  readonly implement: PhaseDefaults;
  readonly review: PhaseDefaults & { readonly cleanSignal: string };
  readonly fix: PhaseDefaults;
} = {
  implement: {
    model: "claude-opus-5",
    effort: "medium",
    maxIterations: 3,
    completionSignal: "IMPLEMENTATION COMPLETE",
  },
  review: {
    model: "claude-opus-5",
    effort: "medium",
    maxIterations: 2,
    completionSignal: "REVIEW FINDINGS POSTED",
    cleanSignal: "REVIEW CLEAN",
  },
  fix: {
    model: "claude-opus-5",
    effort: "medium",
    maxIterations: 2,
    completionSignal: "FIXES COMPLETE",
  },
};

/** A phase given zero iterations returns no signal and no commits, so the
 *  driver's existing gates report it without knowing it was skipped. */
export type PhaseResult = Pick<
  WorktreeRunResult,
  "iterations" | "commits" | "completionSignal"
>;

export async function runPhase(args: {
  readonly name: PhaseName;
  readonly phase: PhaseConfig;
  readonly worktree: Worktree;
  readonly promptArgs: Record<string, string | number>;
  readonly logDir: string;
  readonly runId: string;
}): Promise<PhaseResult> {
  const { name, phase } = args;

  /** With every key but the prompt path optional, this is the only place the
   *  values that came from the binary become visible. */
  console.log(
    `[${name}] model=${phase.model} effort=${phase.effort} ` +
      `maxIterations=${phase.maxIterations} ` +
      `signals=${phase.completionSignals.map((signal) => JSON.stringify(signal)).join(" ")} ` +
      `prompt=${phase.prompt}`,
  );

  if (phase.maxIterations === 0) {
    console.log(`[${name}] not run: maxIterations=0`);
    return { iterations: [], commits: [], completionSignal: undefined };
  }

  const logFilePath = join(args.logDir, `${args.runId}-${name}.log`);

  /** noSandbox() declines to pass --dangerously-skip-permissions and the host
   *  allowlist is not the agents' to widen, so the grant rides on the agent.
   *  Model and effort are data; the permission posture stays a literal here. */
  const agent = claudeCode(phase.model, {
    effort: phase.effort,
    permissionMode: "bypassPermissions",
  });

  const result = await args.worktree.run({
    agent,
    sandbox: noSandbox(),
    name,
    promptFile: phase.prompt,
    promptArgs: args.promptArgs,
    maxIterations: phase.maxIterations,
    completionSignal: [...phase.completionSignals],
    logging: { type: "file", path: logFilePath },
  });

  console.log(
    `[${name}] ${result.iterations.length} iteration(s), ` +
      `${result.commits.length} commit(s), ` +
      `signal=${result.completionSignal ?? "none"}, ` +
      `log=${result.logFilePath ?? logFilePath}`,
  );
  return result;
}
