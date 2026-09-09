import { sh } from "./shell.ts";

export type Issue = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly state: string;
  readonly assignees: { readonly login: string }[];
};

export type PullRequest = {
  readonly number: number;
  readonly url: string;
};

/** gh infers owner/name from the remote of the repository it runs in, and that
 *  repository is the one being driven. */
export function forge(repoRoot: string) {
  const gh = (args: string[]) => sh("gh", args, repoRoot);

  return {
    viewerLogin: () => gh(["api", "user", "--jq", ".login"]),

    readIssue: async (number: number): Promise<Issue> => {
      const raw = await gh([
        "issue",
        "view",
        String(number),
        "--json",
        "number,title,body,url,state,assignees",
      ]);
      return JSON.parse(raw) as Issue;
    },

    claimIssue: async (number: number): Promise<void> => {
      await gh(["issue", "edit", String(number), "--add-assignee", "@me"]);
    },

    openPullRequestFor: async (branch: string): Promise<number | undefined> => {
      const raw = await gh([
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "open",
        "--json",
        "number",
        "--jq",
        ".[0].number // empty",
      ]);
      return raw === "" ? undefined : Number(raw);
    },

    createPullRequest: async (args: {
      readonly branch: string;
      readonly baseBranch: string;
      readonly issue: Issue;
    }): Promise<PullRequest> => {
      const body = [
        `Closes #${args.issue.number}.`,
        "",
        "Opened unattended by `agentflow`. The review comments below were written",
        "by a second agent with no memory of writing the code under review.",
      ].join("\n");

      const output = await gh([
        "pr",
        "create",
        "--base",
        args.baseBranch,
        "--head",
        args.branch,
        "--title",
        args.issue.title,
        "--body",
        body,
      ]);
      /** gh prints advisory lines before the URL it created. */
      const url = output.split("\n").at(-1)?.trim() ?? "";
      const number = Number(url.split("/").pop());
      if (!Number.isInteger(number)) {
        throw new Error(`could not read a pull request number out of "${output}"`);
      }
      return { number, url };
    },
  };
}
