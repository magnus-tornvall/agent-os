import type { Issue, IssueProvider } from "./issues.ts";
import { sh } from "./shell.ts";

type IssuePayload = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: string;
  readonly assignees: readonly { readonly login: string }[];
};

/** gh infers owner/name from the remote of the repository it runs in, and that
 *  repository is the one being driven. Its field names are fixed by `--json`,
 *  so this provider has nothing to map and nothing to configure. */
export function githubIssues(repoRoot: string): IssueProvider {
  const gh = (args: string[]) => sh("gh", args, repoRoot);

  return {
    prefix: "gh",

    readIssue: async (number: number): Promise<Issue> => {
      const raw = await gh([
        "issue",
        "view",
        String(number),
        "--json",
        "number,title,body,url,state,assignees",
      ]);
      const payload = JSON.parse(raw) as IssuePayload;
      return {
        number: payload.number,
        ref: `gh:${payload.number}`,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        open: payload.state === "OPEN",
        state: payload.state.toLowerCase(),
        assignees: payload.assignees.map((assignee) => assignee.login),
      };
    },

    claimIssue: async (number: number): Promise<void> => {
      await gh(["issue", "edit", String(number), "--add-assignee", "@me"]);
    },

    claimant: () => gh(["api", "user", "--jq", ".login"]),

    pullRequestReference: (issue) => `Closes #${issue.number}.`,

    close: () => Promise.resolve(),
  };
}
