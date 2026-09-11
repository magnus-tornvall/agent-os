import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  AGENT_KINDS,
  DEFAULT_AGENT_KIND,
  agentFor,
  type Agent,
  type AgentKind,
} from "./agents.ts";
import {
  AZURE_DEVOPS_FIELD_KEYS,
  ISSUE_PREFIXES,
  type AzureDevOpsFieldMap,
  type IssuePrefix,
  type IssueProviderConfig,
  type IssuesConfig,
} from "./issues.ts";
import {
  PHASE_DEFAULTS,
  PHASE_NAMES,
  type PhaseConfig,
  type PhaseName,
  type ReviewPhaseConfig,
} from "./phases.ts";

export const CONFIG_FILENAME = "agentflow.toml";

const MAX_ITERATIONS_CEILING = 5;

const TOP_LEVEL_KEYS = ["agent", "phases", "copyToWorktree", "issues"] as const;

const ISSUES_KEYS = ["default", "providers"] as const;

const AZURE_DEVOPS_KEYS = [
  "organization",
  "project",
  "claimant",
  "openStates",
  "fields",
] as const;

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
  /** Resolved here rather than by the driver, because what a phase's `model`
   *  and `effort` may be is the agent's to say and the two are validated
   *  together. */
  readonly agent: Agent;
  readonly phases: {
    readonly implement: PhaseConfig;
    readonly review: ReviewPhaseConfig;
    readonly fix: PhaseConfig;
    readonly conform: PhaseConfig;
  };
  readonly copyToWorktree: string[];
  /** Which providers a run may read its issue from, and which one a bare issue
   *  number means. */
  readonly issues: IssuesConfig;
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

function agentKind(value: unknown, configPath: string): AgentKind {
  if (value === undefined) {
    return DEFAULT_AGENT_KIND;
  }
  const match = AGENT_KINDS.find((kind) => kind === value);
  if (match === undefined) {
    throw new Error(
      `${configPath}: agent must be one of ${AGENT_KINDS.join(", ")}`,
    );
  }
  return match;
}

/** Which efforts are legal depends on the agent above it in the same file: the
 *  three name different sets, and one of them names none at all. */
function effortValue(
  agent: Agent,
  value: unknown,
  configPath: string,
  path: string,
): string {
  if (agent.efforts === undefined) {
    return nonEmptyString(value, configPath, path);
  }
  const match =
    typeof value === "string"
      ? agent.efforts.find((effort) => effort === value)
      : undefined;
  if (match === undefined) {
    throw new Error(
      `${configPath}: ${path} must be one of ${agent.efforts.join(", ")} ` +
        `for agent "${agent.kind}"`,
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
  agent: Agent,
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
        ? agent.defaultModel
        : nonEmptyString(table.model, configPath, `${path}.model`),
    effort:
      table.effort === undefined
        ? agent.defaultEffort
        : effortValue(agent, table.effort, configPath, `${path}.effort`),
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
  agent: Agent,
): PhaseConfig {
  const table = readTable(phaseTables[name], `${configPath}: [phases.${name}]`);
  rejectUnknownKeys(table, PHASE_KEYS, configPath, `phases.${name}`);
  const { completionSignal, ...rest } = readCommonKeys(
    name,
    table,
    configPath,
    configDir,
    agent,
  );
  return { ...rest, completionSignals: [completionSignal] };
}

function readReviewPhase(
  phaseTables: Record<string, unknown>,
  configPath: string,
  configDir: string,
  agent: Agent,
): ReviewPhaseConfig {
  const table = readTable(phaseTables.review, `${configPath}: [phases.review]`);
  rejectUnknownKeys(table, REVIEW_KEYS, configPath, "phases.review");
  const { completionSignal: findingsSignal, ...rest } = readCommonKeys(
    "review",
    table,
    configPath,
    configDir,
    agent,
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

function stringArray(
  value: unknown,
  configPath: string,
  path: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string" || entry === "")
  ) {
    throw new Error(
      `${configPath}: ${path} must be a non-empty array of non-empty strings`,
    );
  }
  return value as string[];
}

/** The map is the seam's field names against the project's. Every key is
 *  required: a missing one is not a default to fall back on, it is a field the
 *  run cannot read, and the run says so here rather than after it has claimed
 *  the issue. Keys and values alike are matched exactly, because an Azure
 *  DevOps field name is case-sensitive. */
function readFieldMap(
  value: unknown,
  configPath: string,
  path: string,
): AzureDevOpsFieldMap {
  const table = readTable(value, `${configPath}: [${path}]`);
  rejectUnknownKeys(table, AZURE_DEVOPS_FIELD_KEYS, configPath, path);

  const missing = AZURE_DEVOPS_FIELD_KEYS.filter(
    (key) => table[key] === undefined,
  );
  if (missing.length > 0) {
    throw new Error(
      `${configPath}: ${path} is missing the required ` +
        `${missing.length === 1 ? "mapping" : "mappings"} ` +
        `${missing.join(", ")}; each of ${AZURE_DEVOPS_FIELD_KEYS.join(", ")} ` +
        `names the Azure DevOps field it is read from`,
    );
  }

  return {
    title: nonEmptyString(table.title, configPath, `${path}.title`),
    body: nonEmptyString(table.body, configPath, `${path}.body`),
    state: nonEmptyString(table.state, configPath, `${path}.state`),
    assignedTo: nonEmptyString(
      table.assignedTo,
      configPath,
      `${path}.assignedTo`,
    ),
  };
}

function readGithubProvider(
  value: unknown,
  configPath: string,
): IssueProviderConfig {
  const path = "issues.providers.gh";
  const table = readTable(value, `${configPath}: [${path}]`);
  const declared = Object.keys(table);
  if (declared.length > 0) {
    throw new Error(
      `${configPath}: [${path}] takes no keys — gh reads the repository from ` +
        `its git remote and its field names are fixed; unrecognised: ` +
        `${declared.join(", ")}`,
    );
  }
  return { prefix: "gh" };
}

function readAzureDevOpsProvider(
  value: unknown,
  configPath: string,
): IssueProviderConfig {
  const path = "issues.providers.ado";
  const table = readTable(value, `${configPath}: [${path}]`);
  rejectUnknownKeys(table, AZURE_DEVOPS_KEYS, configPath, path);
  return {
    prefix: "ado",
    organization: nonEmptyString(
      table.organization,
      configPath,
      `${path}.organization`,
    ),
    project: nonEmptyString(table.project, configPath, `${path}.project`),
    claimant: nonEmptyString(table.claimant, configPath, `${path}.claimant`),
    openStates: stringArray(
      table.openStates,
      configPath,
      `${path}.openStates`,
    ),
    fields: readFieldMap(table.fields, configPath, `${path}.fields`),
  };
}

/** A default is optional, but one naming a provider the repository has not
 *  declared would only be discovered by the run it was needed for. */
function defaultPrefix(
  value: unknown,
  providers: readonly IssueProviderConfig[],
  configPath: string,
): IssuePrefix | undefined {
  if (value === undefined) {
    return undefined;
  }
  const declared = providers.map((provider) => provider.prefix);
  const match = declared.find((prefix) => prefix === value);
  if (match === undefined) {
    throw new Error(
      `${configPath}: issues.default must be one of the providers this ` +
        `repository declares: ${declared.join(", ")}`,
    );
  }
  return match;
}

/** A provider is available to a run because the repository declared a table for
 *  it, so which prefixes an invocation may use is answerable by reading the
 *  config. */
function readIssues(top: Record<string, unknown>, configPath: string): IssuesConfig {
  if (top.issues === undefined) {
    throw new Error(
      `${configPath}: no [issues] table. A run reads its issue through a ` +
        `provider, and a repository declares which providers it draws issues ` +
        `from: a table under [issues.providers] for each of ` +
        `${ISSUE_PREFIXES.join(", ")} it uses.`,
    );
  }

  const table = readTable(top.issues, `${configPath}: [issues]`);
  rejectUnknownKeys(table, ISSUES_KEYS, configPath, "issues");

  const providerTables = readTable(
    table.providers,
    `${configPath}: [issues.providers]`,
  );
  rejectUnknownKeys(
    providerTables,
    ISSUE_PREFIXES,
    configPath,
    "issues.providers",
  );

  const providers = ISSUE_PREFIXES.filter(
    (prefix) => providerTables[prefix] !== undefined,
  ).map((prefix) =>
    prefix === "gh"
      ? readGithubProvider(providerTables.gh, configPath)
      : readAzureDevOpsProvider(providerTables.ado, configPath),
  );
  if (providers.length === 0) {
    throw new Error(
      `${configPath}: [issues.providers] declares no provider; one table for ` +
        `each of ${ISSUE_PREFIXES.join(", ")} this repository draws issues from`,
    );
  }

  return {
    providers,
    defaultPrefix: defaultPrefix(table.default, providers, configPath),
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

  const agent = agentFor(agentKind(top.agent, configPath));
  const issues = readIssues(top, configPath);

  const phaseTables = readTable(top.phases, `${configPath}: [phases]`);
  rejectUnknownKeys(phaseTables, PHASE_NAMES, configPath, "phases");
  const configDir = dirname(configPath);

  const phases = {
    implement: readPhase("implement", phaseTables, configPath, configDir, agent),
    review: readReviewPhase(phaseTables, configPath, configDir, agent),
    fix: readPhase("fix", phaseTables, configPath, configDir, agent),
    conform: readPhase("conform", phaseTables, configPath, configDir, agent),
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

  return { agent, phases, issues, copyToWorktree: copyDeclared as string[] };
}
