import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  EFFORTS,
  PHASE_DEFAULTS,
  PHASE_NAMES,
  type Effort,
  type PhaseConfig,
  type PhaseName,
  type ReviewPhaseConfig,
} from "./phases.ts";

export const CONFIG_FILENAME = "agentflow.toml";

const MAX_ITERATIONS_CEILING = 5;

const TOP_LEVEL_KEYS = ["phases", "copyToWorktree"] as const;

const PHASE_KEYS = [
  "prompt",
  "model",
  "effort",
  "maxIterations",
  "completionSignal",
] as const;

/** Review is the one phase the driver branches on, so it alone names a second
 *  signal — the one meaning there is nothing to fix. */
const REVIEW_KEYS = [...PHASE_KEYS, "cleanSignal"] as const;

export type Config = {
  readonly phases: {
    readonly implement: PhaseConfig;
    readonly review: ReviewPhaseConfig;
    readonly fix: PhaseConfig;
    readonly conform: PhaseConfig;
  };
  readonly copyToWorktree: string[];
};

/** A prompt path is written relative to the config file that declares it, so a
 *  repository can point at a prompt set that lives outside it. */
function resolvePromptPath(raw: string, configDir: string): string {
  if (raw === "~" || raw.startsWith("~/")) {
    return join(homedir(), raw.slice(1));
  }
  return isAbsolute(raw) ? raw : resolve(configDir, raw);
}

function readTable(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be a table`);
  }
  return value as Record<string, unknown>;
}

/** Every key but the prompt path is optional, so a misspelled one would parse,
 *  validate, run, and quietly use the default — and the wrong run gives you no
 *  thread to pull. */
function rejectUnknownKeys(
  table: Record<string, unknown>,
  allowed: readonly string[],
  configPath: string,
  path: string,
): void {
  const unknown = Object.keys(table).find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    throw new Error(
      `${configPath}: unrecognised key "${path === "" ? unknown : `${path}.${unknown}`}"; ` +
        `recognised here: ${allowed.join(", ")}`,
    );
  }
}

function nonEmptyString(
  value: unknown,
  configPath: string,
  path: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${configPath}: ${path} must be a non-empty string`);
  }
  return value;
}

function effortValue(
  value: unknown,
  configPath: string,
  path: string,
): Effort {
  const match =
    typeof value === "string"
      ? EFFORTS.find((effort) => effort === value)
      : undefined;
  if (match === undefined) {
    throw new Error(
      `${configPath}: ${path} must be one of ${EFFORTS.join(", ")}`,
    );
  }
  return match;
}

/** Zero is how a repository omits a phase; there is no separate flag. */
function iterationCount(
  value: unknown,
  configPath: string,
  path: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_ITERATIONS_CEILING
  ) {
    throw new Error(
      `${configPath}: ${path} must be an integer from 0 to ${MAX_ITERATIONS_CEILING}`,
    );
  }
  return value;
}

function readCommonKeys(
  name: PhaseName,
  table: Record<string, unknown>,
  configPath: string,
  configDir: string,
) {
  const path = `phases.${name}`;
  const defaults = PHASE_DEFAULTS[name];
  return {
    prompt: resolvePromptPath(
      nonEmptyString(table.prompt, configPath, `${path}.prompt`),
      configDir,
    ),
    model:
      table.model === undefined
        ? defaults.model
        : nonEmptyString(table.model, configPath, `${path}.model`),
    effort:
      table.effort === undefined
        ? defaults.effort
        : effortValue(table.effort, configPath, `${path}.effort`),
    maxIterations:
      table.maxIterations === undefined
        ? defaults.maxIterations
        : iterationCount(
            table.maxIterations,
            configPath,
            `${path}.maxIterations`,
          ),
    completionSignal:
      table.completionSignal === undefined
        ? defaults.completionSignal
        : nonEmptyString(
            table.completionSignal,
            configPath,
            `${path}.completionSignal`,
          ),
  };
}

function readPhase(
  name: PhaseName,
  phaseTables: Record<string, unknown>,
  configPath: string,
  configDir: string,
): PhaseConfig {
  const table = readTable(phaseTables[name], `${configPath}: [phases.${name}]`);
  rejectUnknownKeys(table, PHASE_KEYS, configPath, `phases.${name}`);
  const { completionSignal, ...rest } = readCommonKeys(
    name,
    table,
    configPath,
    configDir,
  );
  return { ...rest, completionSignals: [completionSignal] };
}

function readReviewPhase(
  phaseTables: Record<string, unknown>,
  configPath: string,
  configDir: string,
): ReviewPhaseConfig {
  const table = readTable(phaseTables.review, `${configPath}: [phases.review]`);
  rejectUnknownKeys(table, REVIEW_KEYS, configPath, "phases.review");
  const { completionSignal: findingsSignal, ...rest } = readCommonKeys(
    "review",
    table,
    configPath,
    configDir,
  );
  const cleanSignal =
    table.cleanSignal === undefined
      ? PHASE_DEFAULTS.review.cleanSignal
      : nonEmptyString(table.cleanSignal, configPath, "phases.review.cleanSignal");
  return {
    ...rest,
    completionSignals: [findingsSignal, cleanSignal],
    findingsSignal,
    cleanSignal,
  };
}

export async function loadConfig(repoRoot: string): Promise<Config> {
  const configPath = join(repoRoot, CONFIG_FILENAME);
  const raw = await readFile(configPath, "utf8").catch(() => {
    throw new Error(
      `no ${CONFIG_FILENAME} at ${repoRoot}. agentflow carries a default for ` +
        `every setting but one: every repository it drives declares the prompt ` +
        `path of each phase.`,
    );
  });

  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (error) {
    throw new Error(`${configPath} is not valid TOML: ${String(error)}`);
  }

  const top = readTable(parsed, configPath);
  rejectUnknownKeys(top, TOP_LEVEL_KEYS, configPath, "");

  const phaseTables = readTable(top.phases, `${configPath}: [phases]`);
  rejectUnknownKeys(phaseTables, PHASE_NAMES, configPath, "phases");
  const configDir = dirname(configPath);

  const phases = {
    implement: readPhase("implement", phaseTables, configPath, configDir),
    review: readReviewPhase(phaseTables, configPath, configDir),
    fix: readPhase("fix", phaseTables, configPath, configDir),
    conform: readPhase("conform", phaseTables, configPath, configDir),
  };

  const copyDeclared = top.copyToWorktree ?? [];
  if (
    !Array.isArray(copyDeclared) ||
    copyDeclared.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`${configPath}: copyToWorktree must be an array of strings`);
  }

  /** A missing prompt is otherwise discovered by the first phase, which is after
   *  the issue has been claimed and the worktree created. */
  for (const name of PHASE_NAMES) {
    const { prompt } = phases[name];
    await readFile(prompt, "utf8").catch(() => {
      throw new Error(
        `${configPath}: phases.${name}.prompt points at "${prompt}", which is ` +
          `missing or unreadable`,
      );
    });
  }

  return { phases, copyToWorktree: copyDeclared as string[] };
}
