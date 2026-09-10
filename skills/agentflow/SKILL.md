---
name: agentflow
description: Drive one GitHub issue to a review-ready pull request in a single run - six preflight refusals, a worktree, then four phase skills each invoked as a fresh subagent that cannot see the others' reasoning. Use when asked to run agentflow on an issue number.
disable-model-invocation: true
---

# Drive one issue to a review-ready pull request

You are the orchestrator. You take one argument, an issue number, and you either
refuse before touching anything or you carry the issue through four phases and
report which of five outcomes happened.

This is the skill path. A compiled binary in this repository does the same run
through `@ai-hero/sandcastle`, and the two exist side by side so they can be
compared. You share no code with it and you must not read `src/` to decide what
to do - everything you need is below.

## The two rules that hold the whole thing up

**You own the forge.** Claiming the issue, pushing, and opening the pull request
are yours. The review phase posts its own findings and the conformance phase
posts its own judgement, because those are their output rather than process
calls. No other GitHub call is made by anything but you.

**Every phase is a fresh subagent.** Invoke each phase with the `Agent` tool and
`subagent_type: "general-purpose"`. Never `subagent_type: "fork"` - a fork
inherits your context, and then the agent reviewing the code is the one that
watched it being written. The isolation is the point, and `fork` silently
removes it.

Do not carry a phase's reasoning into the next phase's prompt. Pass only the
values each phase's section below names.

## Step 1 - fix the values

```
git rev-parse --show-toplevel      # REPO_ROOT
git rev-parse --abbrev-ref HEAD    # BASE_BRANCH
```

The issue number is your argument. It must be a positive integer; if it is not,
stop and say `usage: agentflow <issue-number>`.

`BRANCH` is always `agent/issue-<n>`. It is not configurable - a recognisable
branch name across every repository is the point. Note that the binary uses the
same name, so the two paths cannot hold the same issue at the same time. That is
expected; delete the branch between runs.

`WORKTREE` is `<REPO_ROOT>/.sandcastle/skill-worktrees/issue-<n>`.
`.sandcastle/` is already gitignored, and `skill-worktrees` keeps you clear of
the binary's own `worktrees` directory.

## Step 2 - the six refusals

Run all six before you change anything anywhere. Each one that fails ends the
run: print `agentflow: <the message>` and stop. Do not claim the issue, do not
create the worktree, do not print an outcome word. A refusal is not an outcome.

1. **The base branch is on origin.**
   `git ls-remote --exit-code --heads origin <BASE_BRANCH>` must succeed.
   Message: `base branch "<BASE_BRANCH>" is not on origin; push it before running`
   `gh pr create` fails late and confusingly when the base is local-only.

2. **The branch does not exist locally.**
   `git rev-parse --verify refs/heads/<BRANCH>` must fail.
   Message: `branch "<BRANCH>" already exists locally; delete it and run again`

3. **The branch does not exist on origin.**
   `git ls-remote --exit-code --heads origin <BRANCH>` must fail.
   Message: `branch "<BRANCH>" already exists on origin; delete it and run again`

4. **No pull request is open for it.**
   `gh pr list --head <BRANCH> --state open --json number --jq '.[0].number // empty'`
   must print nothing.
   Message: `pull request #<number> is already open for "<BRANCH>"`

5. **The issue is open.**
   `gh issue view <n> --json number,title,body,url,state,assignees`
   `.state` must be `OPEN`. Keep this output - it is where `ISSUE_TITLE` and
   `ISSUE_BODY` come from, and you do not fetch them twice.
   Message: `issue #<n> is <state lowercased>, not open`

6. **The issue is yours to claim.**
   `gh api user --jq .login` gives the viewer. Every login in `.assignees` must
   equal it; an empty assignee list passes.
   Message: `issue #<n> is assigned to <others>, not to <viewer>`

Then print the run header:

```
issue #<n>: <ISSUE_TITLE>
repository <REPO_ROOT>
base <BASE_BRANCH>, branch <BRANCH>
```

## Step 3 - claim it

```
gh issue edit <n> --add-assignee @me
```

Print `claimed`.

## Step 4 - open the worktree

```
git -C <REPO_ROOT> worktree add <WORKTREE> -b <BRANCH> <BASE_BRANCH>
```

Print `worktree <WORKTREE>`.

From here on, every phase runs in `<WORKTREE>` and every `git` call about the
branch is made there. You are responsible for the teardown in step 10 whatever
else happens, including when a phase fails.

## Step 5 - implement

Spawn a subagent whose prompt is exactly this shape:

```
Invoke the Skill tool with skill: "agentflow-implement", then follow it exactly.

WORKTREE: <WORKTREE>
ISSUE_NUMBER: <n>
ISSUE_TITLE: <ISSUE_TITLE>
ISSUE_BODY:
<ISSUE_BODY>
```

When it returns, read the branch rather than the report:

```
git -C <WORKTREE> log --oneline <BASE_BRANCH>..HEAD
```

**The gate, and the whole gate.** No commits means no pull request. Print
`implement phase produced no commits - no pull request opened`, go to step 10,
and the outcome is `no-commits`. There is no build, no test and no lint here -
nothing that would require you to know anything about the repository you are
driving.

## Step 6 - push and open the pull request

```
git -C <WORKTREE> push -u origin <BRANCH>
gh pr create --base <BASE_BRANCH> --head <BRANCH> --title '<ISSUE_TITLE>' --body '<body below>'
```

The body, verbatim except the issue number:

```
Closes #<n>.

Opened unattended by the `agentflow` orchestrator skill. The review comments
below were written by a second agent with no memory of writing the code under
review.
```

`gh pr create` prints advisory lines before the URL, so read `PR_NUMBER` off the
last line of its output. Print `pull request #<PR_NUMBER> <url>`.

## Step 7 - review

```
Invoke the Skill tool with skill: "agentflow-review", then follow it exactly.

WORKTREE: <WORKTREE>
BASE_BRANCH: <BASE_BRANCH>
PR_NUMBER: <PR_NUMBER>
ISSUE_NUMBER: <n>
ISSUE_TITLE: <ISSUE_TITLE>
ISSUE_BODY:
<ISSUE_BODY>
```

Read the subagent's final report for one of two exact strings, `REVIEW CLEAN` or
`REVIEW FINDINGS POSTED`. Record which, or that neither appeared.

**Neither appeared** means you do not know whether the reviewer finished, so the
comment set on the pull request may be partial. Print

```
review phase ended without a completion signal; pull request #<PR_NUMBER> is
open and needs a human
```

then skip steps 8 and 9, go to step 10, and the outcome is
`review-inconclusive`. A fix phase run on that guess is worse than none.

## Step 8 - fix, whichever signal came back

Run this phase on `REVIEW CLEAN` as well as on `REVIEW FINDINGS POSTED`. The
signal says whether the review *completed*; it is not evidence of what is on the
pull request. A reviewer that posts findings and then prints `REVIEW CLEAN`
leaves them unanswered forever if you trust the signal for that, so the fix
phase reads the comments itself and decides from them.

```
Invoke the Skill tool with skill: "agentflow-fix", then follow it exactly.

WORKTREE: <WORKTREE>
PR_NUMBER: <PR_NUMBER>
```

Then, if it committed anything:

```
git -C <WORKTREE> log --oneline <BASE_BRANCH>..HEAD    # more than step 5 saw?
git -C <WORKTREE> push
```

A fix phase that found nothing to answer commits nothing, and that is a valid
result - do not push and do not treat it as a failure.

## Step 9 - conform

```
Invoke the Skill tool with skill: "agentflow-conform", then follow it exactly.

WORKTREE: <WORKTREE>
BASE_BRANCH: <BASE_BRANCH>
PR_NUMBER: <PR_NUMBER>
ISSUE_NUMBER: <n>
ISSUE_TITLE: <ISSUE_TITLE>
ISSUE_BODY:
<ISSUE_BODY>
```

Look for `CONFORMANCE POSTED` in the report. The judgement itself is
informational and decides nothing here - only a failure to post it reaches the
outcome. If the string is absent, print

```
conform phase ended without a completion signal; whether a scope judgement
reached pull request #<PR_NUMBER> is unknown
```

and the outcome is `conform-inconclusive`.

## Step 10 - close the worktree

```
git -C <REPO_ROOT> worktree remove <WORKTREE>
```

If that fails because the worktree is dirty, leave it where it is and print
`worktree preserved (dirty): <WORKTREE>`. An uncommitted change is evidence
about the phase that left it, and deleting it destroys the only copy.

## Step 11 - report

One phase gets one attempt. There is no retry, no resume and no state file: to
run again, delete the branch locally and on origin.

Work out the outcome in this order and stop at the first that matches:

| Condition | Outcome |
|---|---|
| implement committed nothing | `no-commits` |
| review printed neither signal | `review-inconclusive` |
| conform did not print its signal | `conform-inconclusive` |
| review was `REVIEW CLEAN` and fix committed nothing | `clean-review` |
| anything else | `fixed` |

Print exactly one final line:

```
done: <outcome>
```

Nothing after it. The word is the entire artifact of a run - there is no exit
code to carry it - and it is the one fixed point this path and the binary both
produce.
