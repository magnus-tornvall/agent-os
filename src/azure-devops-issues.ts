import type {
  AzureDevOpsIssuesConfig,
  Issue,
  IssueProvider,
} from "./issues.ts";
import { mcpServer } from "./mcp.ts";

/** npx is how the server is on PATH without agentflow carrying it, and the
 *  organization is an argument of the server rather than of a call. */
const MCP_PACKAGE = "@azure-devops/mcp";

const READ_TOOL = "wit_work_item";

const WRITE_TOOL = "wit_work_item_write";

export function azureDevOpsIssues(
  config: AzureDevOpsIssuesConfig,
): IssueProvider {
  const { fields, project } = config;
  const server = mcpServer({
    command: "npx",
    args: ["-y", MCP_PACKAGE, config.organization],
    label: `the ${MCP_PACKAGE} server for ${config.organization}`,
  });

  return {
    prefix: "ado",

    readIssue: async (number: number): Promise<Issue> => {
      const answered = await server.callTool(READ_TOOL, {
        action: "get",
        id: number,
        project,
        /** Asked for by their mapped names, and read back under exactly those:
         *  the map is the only place a field name is written. */
        fields: [fields.title, fields.body, fields.state, fields.assignedTo],
      });

      const workItem = readWorkItem(answered, number);
      const state = requiredField(workItem, fields.state, number);
      const assignee = identityName(workItem[fields.assignedTo]);

      return {
        number,
        ref: `ado:${number}`,
        title: requiredField(workItem, fields.title, number),
        /** Azure DevOps omits a field it has no value for, so an unset
         *  description is an empty body rather than a mismapped name. */
        body: optionalField(workItem[fields.body]),
        url: workItemUrl(config, number),
        open: config.openStates.includes(state),
        state,
        assignees: assignee === undefined ? [] : [assignee],
      };
    },

    claimIssue: async (number: number): Promise<void> => {
      await server.callTool(WRITE_TOOL, {
        action: "update",
        id: number,
        project,
        updates: [
          {
            op: "add",
            path: `/fields/${fields.assignedTo}`,
            value: config.claimant,
          },
        ],
      });
    },

    claimant: () => Promise.resolve(config.claimant),

    /** Nothing a GitHub pull request body says closes an Azure Boards work
     *  item, so this states what the change answers and leaves the work item's
     *  state to whoever owns it. `AB#` is what the Azure Boards app links on,
     *  where a repository has it installed. */
    pullRequestReference: (issue) =>
      `Answers Azure DevOps work item AB#${issue.number} — ${issue.url}`,

    close: () => server.close(),
  };
}

/** The server wraps its JSON in a banner marking the content untrusted, so the
 *  answer is read out from between the braces rather than parsed whole. */
function readWorkItem(
  answered: string,
  number: number,
): Record<string, unknown> {
  const start = answered.indexOf("{");
  const end = answered.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw new Error(
      `reading work item ${number}: the answer carried no JSON: ` +
        `${answered.slice(0, 200)}`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(answered.slice(start, end + 1));
  } catch (error) {
    throw new Error(
      `reading work item ${number}: the answer is not valid JSON: ${String(error)}`,
    );
  }

  const workItemFields = (payload as { readonly fields?: unknown }).fields;
  if (
    typeof workItemFields !== "object" ||
    workItemFields === null ||
    Array.isArray(workItemFields)
  ) {
    throw new Error(`work item ${number} came back with no fields`);
  }
  return workItemFields as Record<string, unknown>;
}

/** A title and a state are mandatory on every work item, so a missing one is
 *  the mapped name being wrong rather than the field being empty. */
function requiredField(
  workItem: Record<string, unknown>,
  name: string,
  number: number,
): string {
  const value = workItem[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(
      `work item ${number} has no "${name}"; the name comes from ` +
        `issues.providers.ado.fields and Azure DevOps field names are ` +
        `case-sensitive`,
    );
  }
  return value;
}

function optionalField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** An identity comes back as an object, and its unique name is the form the
 *  configured claimant is written in. */
function identityName(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value === "" ? undefined : value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const identity = value as {
    readonly uniqueName?: unknown;
    readonly displayName?: unknown;
  };
  for (const candidate of [identity.uniqueName, identity.displayName]) {
    if (typeof candidate === "string" && candidate !== "") {
      return candidate;
    }
  }
  return undefined;
}

/** Built rather than read off the answer, whose own links address the project
 *  by its GUID. */
function workItemUrl(config: AzureDevOpsIssuesConfig, number: number): string {
  const organization = encodeURIComponent(config.organization);
  const project = encodeURIComponent(config.project);
  return `https://dev.azure.com/${organization}/${project}/_workitems/edit/${number}`;
}
