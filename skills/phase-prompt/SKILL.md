---
name: phase-prompt
description: Document what the agentflow phase contract is and how to write a prompt
  against it, so a new prompt lands correct on the first try rather than by copying
  whichever prompt was opened first. Use when adding a prompt to workflows/prompts/.
disable-model-invocation: true
---

# phase-prompt

Agentflow drives GitHub issues to pull requests and back in one unattended run. A
phase is one step of that pipeline, and a phase prompt tells the agent what to do
in that step. The driver and the prompt form a contract: the driver supplies
arguments, watches for a completion signal, and owns certain GitHub operations; the
prompt must state the signal exactly and must tell the agent which operations are
off-limits.

This contract is checked nowhere. A prompt that misstates it will run until
`maxIterations` is exhausted without the driver ever recognizing success, costing an
entire run. Four rules make the contract visible and checkable before the prompt is
ever run.

## Rule 1: The completion signal is a contract

A phase ends when the agent prints the exact line the driver is watching for. The
driver branches on which line came back. The signal lives in two places and nothing
checks that they agree:

1. The prompt text — the line the agent is instructed to print when done
2. The phase's `completionSignal` in `agentflow.toml` or the driver code

A mismatch costs the whole run. The signal must be printed exactly, with nothing
after it — not a period, not an explanation, not a blank line.

**Check your prompt:** The line your prompt instructs the agent to print at the
end must match word-for-word a `completionSignal` value for the phase it lives in.
Run `grep completionSignal src/phases.ts` to see what the driver expects from your
phase.

## Rule 2: Prompt arguments are `{{NAME}}` placeholders substituted by the driver

A prompt receives only the arguments its own phase is given. A placeholder the
driver does not supply is not substituted — it remains in the text as literal
`{{NAME}}`.

Each phase receives a fixed argument set:

**implement phase:**
- `ISSUE_NUMBER` — GitHub issue number
- `ISSUE_TITLE` — issue title
- `ISSUE_BODY` — issue description
- `ISSUE_URL` — link to the issue on GitHub

**review phase:**
- `PR_NUMBER` — pull request number
- `PR_URL` — link to the pull request on GitHub
- `BASE_BRANCH` — the branch the PR targets
- `ISSUE_NUMBER` — GitHub issue number
- `ISSUE_TITLE` — issue title
- `ISSUE_BODY` — issue description

**fix phase:**
- `PR_NUMBER` — pull request number
- `PR_URL` — link to the pull request on GitHub
- `BASE_BRANCH` — the branch the PR targets

**Check your prompt:** Every `{{NAME}}` placeholder you write must be in the list
above for your phase. If you used a placeholder that is not supplied, the driver
will not substitute it and the agent will see literal text.

## Rule 3: The driver owns GitHub and pushing; say which side of the line you are on

The driver claims the issue, opens the pull request, and pushes commits. The
reviewing agent is the exception: it posts findings as comments itself.

A prompt must tell its agent which operations are off-limits, because a duplicate
call from an agent contradicts a call the driver already made. The agent cannot
know what the driver did without being told.

The three phases divide this way:

**implement phase:** The driver will claim the issue and open the pull request
and push. The agent must commit locally and stop — no GitHub calls at all.

**review phase:** The driver has already opened the pull request. The agent must
post its own findings and nothing else — no approval, no labels, no issue edits,
no replies to comments.

**fix phase:** The driver will push; the agent must not. The agent commits locally
and stops — no GitHub calls at all.

**Check your prompt:** Your prompt must state explicitly which GitHub operations
the agent owns and which the driver owns. If your phase driver code does something
on GitHub, tell the agent not to.

## Rule 4: The agent is unattended and has no memory of the other phases

Each phase is a fresh agent. The reviewer does not know who wrote the code under
review. The agent fixing the review has no idea what the reviewer found.

An unattended agent cannot ask a question or assume the reader wrote the code under
discussion. Work reaches the next phase only through commits. A prompt must say to
commit, and must not expect the agent to ask for guidance or to defer a decision
because the stakes are unclear.

**Check your prompt:** Your prompt must not contain a question directed at a human
reader, and it must not assume the agent wrote the code it is working on. If work
must reach the next phase, the prompt must say to commit before finishing.

