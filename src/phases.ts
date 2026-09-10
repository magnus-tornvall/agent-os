import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";
import type { Worktree, WorktreeRunResult } from "@ai-hero/sandcastle";
import { join } from "node:path";
import type { Agent } from "./agents.ts";

export const PHASE_NAMES = ["implement", "review", "fix", "conform"] as const;

export type PhaseName = (typeof PHASE_NAMES)[number];

export type PhaseConfig = {
  /** Absolute, because sandcastle resolves promptFile against process.cwd(). */
  readonly prompt: string;
  readonly model: string;
  /** Undefined where the configured agent names no efforts and the phase set
   *  none, in which case the agent picks. */
  readonly effort: string | undefined;
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
 *  runs on exactly these. `model` and `effort` are not here: what they may be
 *  is a property of the configured agent, so their defaults ride on it. */
type PhaseDefaults = {
  readonly maxIterations: number;
  readonly completionSignal: string;
};

export const PHASE_DEFAULTS: {
  readonly implement: PhaseDefaults;
  readonly review: PhaseDefaults & { readonly cleanSignal: string };
  readonly fix: PhaseDefaults;
  readonly conform: PhaseDefaults;
} = {
  implement: {
    maxIterations: 3,
    completionSignal: "IMPLEMENTATION COMPLETE",
  },
  review: {
    maxIterations: 2,
    completionSignal: "REVIEW FINDINGS POSTED",
    cleanSignal: "REVIEW CLEAN",
  },
  fix: {
    maxIterations: 2,
    completionSignal: "FIXES COMPLETE",
  },
  /** One iteration, against review's two: a second iteration runs only when the
   *  first printed no signal, and this phase makes a single append-only comment
   *  call, so there is no partial post to recover and a retry risks a duplicate
   *  judgement on the pull request. */
  conform: {
    maxIterations: 1,
    completionSignal: "CONFORMANCE POSTED",
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
  readonly agent: Agent;
  readonly worktree: Worktree;
  readonly promptArgs: Record<string, string | number>;
  readonly logDir: string;
  readonly runId: string;
}): Promise<PhaseResult> {
  const { name, phase, agent } = args;

  /** With every key but the prompt path optional, this is the only place the
   *  values that came from the binary become visible. */
  console.log(
    `[${name}] agent=${agent.kind} model=${phase.model} ` +
      `effort=${phase.effort ?? "unset"} ` +
      `maxIterations=${phase.maxIterations} ` +
      `signals=${phase.completionSignals.map((signal) => JSON.stringify(signal)).join(" ")} ` +
      `prompt=${phase.prompt}`,
  );

  if (phase.maxIterations === 0) {
    console.log(`[${name}] not run: maxIterations=0`);
    return { iterations: [], commits: [], completionSignal: undefined };
  }

  const logFilePath = join(args.logDir, `${args.runId}-${name}.log`);

  const result = await args.worktree.run({
    agent: agent.provider(phase.model, phase.effort),
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
