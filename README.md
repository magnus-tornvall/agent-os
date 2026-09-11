# agent-tools

`agentflow` — a binary that drives one issue to a review-ready pull request in a
single unattended run, and the prompts that tell its agents what to do.

## What a run does

```
$ agentflow 42            # the configured default provider
$ agentflow gh:42         # a GitHub issue
$ agentflow ado:16406     # an Azure DevOps work item
```

One invocation, one issue, and it exits. Nothing resumes it.

| # | Phase | Who | What happens |
|---|---|---|---|
| 1 | preflight | driver | Six refusals, then the issue is claimed and a worktree created on `agent/issue-gh-42` |
| 2 | implement | agent | Reads the issue text it was handed, writes code, commits locally |
| 3 | — | driver | **Gate:** no commits, no pull request. Otherwise push and open the PR |
| 4 | review | agent | Reads the diff with no memory of writing it, posts one comment per finding |
| 5 | fix | agent | Answers each finding — fixing it, or rejecting it with the reason in the commit body |
| 6 | conform | agent | Judges the change against what the issue asked for, posts one scope comment |

The fix phase is skipped when the review comes back clean. The conformance
judgement is posted on both paths.

## The five load-bearing ideas

- **Where the issue lives is a runtime decision.** The prefix on the argument
  picks the provider, and only against the ones the repository declares. The rest
  of the binary reads one issue shape and cannot tell which one answered.
- **The driver owns the forge.** Claiming, opening the PR and pushing are the
  binary's, never an agent's. The two exceptions are deliberate: the reviewer posts
  its own findings and the conformance judge posts its own verdict.
- **Every phase is a fresh agent.** No phase inherits another's context, so the
  reviewer genuinely did not write the code under review. Each prompt stands alone.
- **Commits are the only gate.** No build, no tests, no lint — nothing that would
  require the binary to know anything about the repository it drives.
- **It refuses rather than resumes.** No state file, no crash recovery. Delete the
  branch and run it again.

## Requirements

On `PATH`, authenticated: `git`, `gh`, and the CLI of the configured agent —
`claude`, `codex` or `opencode`. The binary carries neither them nor their
credentials. `bun` is needed to build, not to run.

For the `ado` provider, additionally: `npx`, and a signed-in `az login`. The
binary starts `npx -y @azure-devops/mcp <organization>` on the first work item it
reads, speaks MCP to it over stdio, and closes it when the run ends. It is not
started at all by a run that does not use the provider.

In the repository being driven: an `agentflow.toml` in the root, `.sandcastle/`
gitignored, the base branch pushed to `origin`, and an issue that is open and either
yours or unassigned.

## Build

```sh
npm install
npm run build      # → bin/agentflow
npm run typecheck
```

`bin/` is gitignored — the compiled binary is yours, not the repository's.

## Configure

One TOML file in the root of each repository you drive. There is no layering, no
user-level file and no environment defaults: what a run will do in a repository is
answerable by reading that repository.

```toml
agent = "claude"
copyToWorktree = []

[issues]
default = "gh"

[issues.providers.gh]

[phases.implement]
prompt = "workflows/prompts/implement.md"

[phases.review]
prompt = "workflows/prompts/review.md"

[phases.fix]
prompt = "workflows/prompts/fix.md"

[phases.conform]
prompt = "workflows/prompts/conform.md"
```

All four phase tables are required. Within a phase, `prompt` is the only required key — paths resolve
against the config file that declares it, so one prompt set can be shared across
repositories. `model`, `effort`, `maxIterations` (0–5, where `0` skips the phase)
and `completionSignal` are optional per phase, plus `cleanSignal` on `review`. Any
unrecognised key fails the run.

`agent` is top level — `claude` (the default), `codex` or `opencode`. Every phase
runs on it; there is no per-phase agent. It decides what `model` and `effort` may
say, so both are validated against it and both fall back to its own defaults:
`claude-opus-5`/`medium`, `gpt-5.6-sol`/`medium`, and `opencode/big-pickle` with no
effort at all — OpenCode's variant is whatever the model's provider calls it, so
nothing is guessed there. Expect to set `model` when you leave the default agent.

### Where the issues come from

`[issues]` is required, and a provider is available to a run because the
repository declared a table for it. Which prefixes `agentflow` will accept is
therefore answerable by reading the config, and a prefix outside them is refused
rather than guessed at.

```toml
[issues]
default = "gh"          # what a bare `agentflow 42` means; optional

[issues.providers.gh]   # takes no keys: gh reads the repository from its git
                        # remote, and its field names are fixed by `gh --json`

[issues.providers.ado]
organization = "nethouse-solutions"
project      = "Lambertsson Online"
claimant     = "you@example.com"
openStates   = ["To Do", "Doing"]

[issues.providers.ado.fields]
title      = "System.Title"
body       = "System.Description"
state      = "System.State"
assignedTo = "System.AssignedTo"
```

| Argument | With that config | With no `default` |
|---|---|---|
| `gh:42` | GitHub issue 42 | GitHub issue 42 |
| `ado:16406` | work item 16406 | work item 16406 |
| `42` | GitHub issue 42 | refused |
| `jira:7` | refused | refused |
| `GH:42` | refused — prefixes are matched exactly | refused |

The `ado` table is all required, and the reason each key is there rather than
carried by the binary is that only the project can answer it:

- `openStates` — every Azure DevOps process names its own states, so which ones
  count as open is not something the binary can know. `16406` above sits in
  `To Do`.
- `claimant` — Azure DevOps has no `@me` to assign to, so the identity the run
  claims work items as is configured rather than discovered. It is also what the
  assignment refusal compares an issue's assignees against.
- `[issues.providers.ado.fields]` — the field name map, from the seam's four
  names to the project's. **Both sides are matched exactly.** A field name belongs
  to the project's process, so `System.Title` in one is a `Custom.*` name in the
  next, and `system.title` is not `System.Title` anywhere. All four mappings are
  required: a missing one is not a default to fall back on, it is a field the run
  cannot read, so the run refuses at config load — before it has read, let alone
  claimed, anything.

## How it ends

The last line is `done: <outcome>`.

| Outcome | Exit | Meaning |
|---|---|---|
| `clean-review` | 0 | Nothing found; the conformance judgement is on the PR |
| `fixed` | 0 | Findings posted, answered and pushed; judgement on the PR |
| `no-commits` | 1 | The implement phase left the branch untouched; no PR opened |
| `review-inconclusive` | 1 | The reviewer printed neither signal; the PR needs a human |
| `conform-inconclusive` | 1 | Whether a scope judgement reached the PR is unknown |

A thrown failure prints `agentflow: <message>` to stderr and exits 1 with no
outcome word.

Per-phase logs land in `.sandcastle/logs/issue-<n>-<timestamp>-<phase>.log` in the
repository being driven, and are the only per-run evidence there is.

To re-run after a failure, clear what the refusals check:

```sh
git branch -D agent/issue-gh-42
git push origin --delete agent/issue-gh-42
```

## Two things to know before you run it

The agents are **not sandboxed**. Sandcastle's `noSandbox()` runs them as local
processes against a bind-mounted worktree, and whichever agent you configure is
launched with its approvals bypassed — an unattended run cannot answer a prompt.
What is isolated is the working tree, not your machine.

Nothing **enforces** the division of labour except the prompts. Two phases are told
not to touch GitHub and two are told to make exactly one kind of call; all four
could do anything your `gh` credentials allow.

## Layout

```
src/            the binary — main.ts is the sequence, config.ts the TOML surface,
                agents.ts the three agents it may run on, phases.ts the defaults
                and the one call into sandcastle, issues.ts the issue provider
                seam and the prefix that picks one, github-issues.ts and
                azure-devops-issues.ts the two providers, github.ts the pull
                requests either of them is answered by, mcp.ts the stdio MCP
                client the Azure DevOps provider talks through
workflows/      the four prompts this repository points its own config at
docs/plans/     the plans that record how it got here
skills/         unrelated: the mvc and commit skills
```

## Built on

[`@ai-hero/sandcastle`](https://www.npmjs.com/package/@ai-hero/sandcastle) — the one
dependency. It contributes the git worktree, the agent iteration loop with its
completion signals, prompt assembly (`{{KEY}}` substitution and host expansion of
`` !`command` `` expressions), and the agent and sandbox providers. Everything
else — the phase sequence, the config surface, the refusals, the gate, the branch on
review's two signals, every `gh` call the driver makes, the issue provider seam
and the MCP client behind Azure DevOps — is agentflow.
