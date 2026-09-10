import { claudeCode, codex, opencode } from "@ai-hero/sandcastle";
import type { AgentProvider } from "@ai-hero/sandcastle";

export const AGENT_KINDS = ["claude", "codex", "opencode"] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

export const DEFAULT_AGENT_KIND: AgentKind = "claude";

/** The three agents share a name for the run's two model knobs and nothing
 *  else: each names its own efforts, and a model string written for one means
 *  nothing to another. An Agent carries what the config surface needs to
 *  validate a phase and what a phase needs to run one. */
export type Agent = {
  readonly kind: AgentKind;
  readonly defaultModel: string;
  /** What `effort` may be, or undefined when the agent forwards a
   *  provider-specific string only the agent itself can judge. */
  readonly efforts: readonly string[] | undefined;
  readonly defaultEffort: string | undefined;
  provider(model: string, effort: string | undefined): AgentProvider;
};

const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

/** The run is unattended, so no agent may stop for a permission prompt, and
 *  noSandbox() declines to pass the grant on their behalf. Claude and codex
 *  each take it as an option of their own; opencode reads only the flag the
 *  sandbox sets, so its provider is wrapped to set it. The host allowlist is
 *  not the agents' to widen — model and effort are data, the posture is not. */
const AGENTS: Record<AgentKind, Agent> = {
  claude: {
    kind: "claude",
    defaultModel: "claude-opus-5",
    efforts: CLAUDE_EFFORTS,
    defaultEffort: "medium",
    provider: (model, effort) =>
      claudeCode(model, {
        effort: CLAUDE_EFFORTS.find((candidate) => candidate === effort),
        permissionMode: "bypassPermissions",
      }),
  },
  codex: {
    kind: "codex",
    defaultModel: "gpt-5.6-sol",
    efforts: CODEX_EFFORTS,
    defaultEffort: "medium",
    /** Codex bypasses approvals unless asked for a reviewer of its own, which
     *  agentflow has a phase for. */
    provider: (model, effort) =>
      codex(model, {
        effort: CODEX_EFFORTS.find((candidate) => candidate === effort),
      }),
  },
  opencode: {
    kind: "opencode",
    defaultModel: "opencode/big-pickle",
    /** OpenCode's variant is whatever the model's own provider calls it, so
     *  there is no set to check against and no default worth guessing. */
    efforts: undefined,
    defaultEffort: undefined,
    provider: (model, variant) => {
      const agent = opencode(model, { variant });
      return {
        ...agent,
        buildPrintCommand: (options) =>
          agent.buildPrintCommand({
            ...options,
            dangerouslySkipPermissions: true,
          }),
      };
    },
  },
};

export function agentFor(kind: AgentKind): Agent {
  return AGENTS[kind];
}
