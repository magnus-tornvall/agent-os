import { sh } from "./shell.ts";

export type PullRequest = {
  readonly number: number;
  readonly url: string;
};

/** gh infers owner/name from the remote of the repository it runs in, and that
 *  repository is the one being driven. Pull requests are GitHub's whichever
 *  provider the issue came from: an Azure Boards work item is read and claimed
 *  there, and answered by a pull request here. */
export function forge(repoRoot: string) {
  const gh = (args: string[]) => sh("gh", args, repoRoot);

  return {
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
      readonly title: string;
      /** How the body refers to the issue, which only its provider can word. */
      readonly issueReference: string;
    }): Promise<PullRequest> => {
      const body = [
        args.issueReference,
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
        args.title,
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
