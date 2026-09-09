import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { PHASE_NAMES, type PhaseName } from "./phases.ts";

export const CONFIG_FILENAME = "agentflow.toml";

export type Config = {
  /** Absolute, because sandcastle resolves promptFile against process.cwd(). */
  readonly prompts: Record<PhaseName, string>;
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

function readStringTable(
  value: unknown,
  where: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be a table`);
  }
  return value as Record<string, unknown>;
}

export async function loadConfig(repoRoot: string): Promise<Config> {
  const configPath = join(repoRoot, CONFIG_FILENAME);
  const raw = await readFile(configPath, "utf8").catch(() => {
    throw new Error(
      `no ${CONFIG_FILENAME} at ${repoRoot}. agentflow has no defaults; ` +
        `every repository it drives declares its own prompts.`,
    );
  });

  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(raw);
  } catch (error) {
    throw new Error(`${configPath} is not valid TOML: ${String(error)}`);
  }

  const top = readStringTable(parsed, configPath);
  const promptTable = readStringTable(top.prompts, `${configPath}: [prompts]`);
  const configDir = dirname(configPath);

  const prompts = {} as Record<PhaseName, string>;
  for (const name of PHASE_NAMES) {
    const declared = promptTable[name];
    if (typeof declared !== "string" || declared.length === 0) {
      throw new Error(`${configPath}: prompts.${name} must be a non-empty string`);
    }
    prompts[name] = resolvePromptPath(declared, configDir);
  }

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
    await readFile(prompts[name], "utf8").catch(() => {
      throw new Error(
        `${configPath}: prompts.${name} points at "${prompts[name]}", which is ` +
          `missing or unreadable`,
      );
    });
  }

  return { prompts, copyToWorktree: copyDeclared as string[] };
}
