import { azureDevOpsIssues } from "./azure-devops-issues.ts";
import { githubIssues } from "./github-issues.ts";

/** Which provider a run reads its issue from is decided by the prefix on the
 *  argument, so both may be available in one repository at once. */
export const ISSUE_PREFIXES = ["gh", "ado"] as const;

export type IssuePrefix = (typeof ISSUE_PREFIXES)[number];

/** One shape for the driver's refusals and the phases' prompts, whichever
 *  provider it was read from. */
export type Issue = {
  readonly number: number;
  /** How the run names this issue in its own output, prefix and all, so a log
   *  line can be pasted back as the argument that produced it. */
  readonly ref: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  /** Whether the issue is still open is the provider's to answer: GitHub says
   *  so itself, and an Azure DevOps state means whatever its process says. */
  readonly open: boolean;
  /** The provider's own word for the state, for the refusal that reports it. */
  readonly state: string;
  readonly assignees: readonly string[];
};

/** The seam. The driver reads and claims an issue through this and knows
 *  nothing else about where it lives. */
export type IssueProvider = {
  readonly prefix: IssuePrefix;
  readIssue(number: number): Promise<Issue>;
  claimIssue(number: number): Promise<void>;
  /** The identity this run claims issues as, which the assignment refusal
   *  compares an issue's assignees against. */
  claimant(): Promise<string>;
  /** The line a pull request body opens with. GitHub closes its own issues
   *  from it; nothing a pull request says closes a work item. */
  pullRequestReference(issue: Issue): string;
  /** Releases whatever the provider holds open, and holds the run open until
   *  it has. */
  close(): Promise<void>;
};

/** The seam's field names, to be mapped onto the provider's. Azure DevOps field
 *  names are case-sensitive and belong to the project's process — `System.Title`
 *  in one project is a `Custom.*` name in the next — so every one of these is
 *  declared by the repository rather than guessed here. */
export const AZURE_DEVOPS_FIELD_KEYS = [
  "title",
  "body",
  "state",
  "assignedTo",
] as const;

export type AzureDevOpsFieldKey = (typeof AZURE_DEVOPS_FIELD_KEYS)[number];

export type AzureDevOpsFieldMap = {
  readonly [Key in AzureDevOpsFieldKey]: string;
};

export type AzureDevOpsIssuesConfig = {
  readonly organization: string;
  readonly project: string;
  /** Azure DevOps has no `@me` to assign to, so the identity the run claims
   *  work items as is configured rather than discovered. */
  readonly claimant: string;
  /** Which `state` values count as open. Every process names its own, and the
   *  binary knows none of them. */
  readonly openStates: readonly string[];
  readonly fields: AzureDevOpsFieldMap;
};

/** What a declared provider needs to be built, carried as one value so
 *  resolving a prefix and constructing its provider cannot disagree. */
export type IssueProviderConfig =
  | { readonly prefix: "gh" }
  | ({ readonly prefix: "ado" } & AzureDevOpsIssuesConfig);

export type IssuesConfig = {
  /** Every provider the repository declares, in prefix order. A prefix outside
   *  this is refused rather than guessed at. */
  readonly providers: readonly IssueProviderConfig[];
  /** Which provider a bare issue number means. Without one, a bare number is
   *  an error rather than a guess. */
  readonly defaultPrefix: IssuePrefix | undefined;
};

export type IssueRef = {
  readonly number: number;
  readonly provider: IssueProviderConfig;
};

function usage(available: readonly IssuePrefix[]): string {
  return `usage: agentflow [<prefix>:]<issue-number> — prefixes: ${available.join(", ")}`;
}

/** `gh:42`, `ado:16406`, or a bare `42` when the config names a default.
 *  Prefixes are matched exactly, so `GH:42` is not `gh:42`. */
export function parseIssueRef(
  raw: string | undefined,
  issues: IssuesConfig,
): IssueRef {
  const available = issues.providers.map((provider) => provider.prefix);
  if (raw === undefined || raw === "") {
    throw new Error(usage(available));
  }

  const separator = raw.indexOf(":");
  const prefix: string | undefined =
    separator === -1 ? issues.defaultPrefix : raw.slice(0, separator);
  const digits = separator === -1 ? raw : raw.slice(separator + 1);

  if (prefix === undefined) {
    throw new Error(
      `"${raw}" names no issue provider and this repository configures no ` +
        `issues.default; write it as <prefix>:${digits} with one of ` +
        `${available.join(", ")}, or configure a default`,
    );
  }

  const provider = issues.providers.find(
    (candidate) => candidate.prefix === prefix,
  );
  if (provider === undefined) {
    throw new Error(
      `"${prefix}" is not an issue provider this repository declares; ` +
        `it declares ${available.join(", ")}`,
    );
  }

  const number = Number(digits);
  if (!/^\d+$/.test(digits) || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`"${digits}" is not an issue number. ${usage(available)}`);
  }

  return { number, provider };
}

export function issueProviderFor(
  provider: IssueProviderConfig,
  repoRoot: string,
): IssueProvider {
  switch (provider.prefix) {
    case "gh":
      return githubIssues(repoRoot);
    case "ado":
      return azureDevOpsIssues(provider);
  }
}
