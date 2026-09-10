---
name: agentflow-fix
description: Read the review findings standing on an open pull request and answer each one, fixing it or rejecting it with the reason in the commit body, committing locally without pushing. The fix phase of the agentflow run; invoked by the agentflow orchestrator skill with the pull request number in its prompt.
---

# Apply review findings

## Your values

The prompt that invoked you carries these keys. Read them from there.

- `WORKTREE` - the absolute path you work in. `cd` there first.
- `PR_NUMBER` - the open pull request whose comments you answer.

If either is missing from your prompt, stop and say which.

## The frame

You are running unattended. A reviewing agent left findings as comments on the
pull request. Nobody will answer a question, so decide and say why in the commit
message.

**Read GitHub, write nothing to it.** The one call you make is the `gh pr view`
below. No comment, no reply, no resolve, no label, no review. The orchestrator
that started you owns the push. Do not push; commit locally and stop.

You are run on every pull request this pipeline opens, including ones the
reviewer called clean. Finding nothing to do is a normal result, not an error.

## The findings, as they stand on the pull request

Fetch them yourself, because what is on the pull request is the fact and
anything you were told about it is a claim:

    gh pr view <PR_NUMBER> --json comments --jq '.comments[] | "### @\(.author.login)\n\n\(.body)\n"'

**No findings there.** Change nothing, commit nothing, and say plainly in your
final output that the pull request carried no findings. Do not go looking for
work: a clean review is a result the pipeline is allowed to produce, and a
commit invented to justify your having run is the one outcome worse than no
commit.

**A partial set.** Findings are numbered `Finding N of M`. If the highest `N`
you can see is below `M`, the reviewer stopped before posting everything. Answer
what is there, and say in your final output which numbers were missing - do not
guess at the content of a finding nobody posted.

## What to do

Take each finding in turn. Read the file it names - and the surrounding code or
prose, not just the cited line - before deciding what the fix is.

Then do one of two things, and nothing else:

**Fix it.** Make the smallest change that addresses the root of the finding
rather than its symptom. If the finding is right about a problem but wrong about
the remedy, fix the problem.

**Reject it.** A finding can be wrong. If it is, leave the file alone and record
the rejection in the commit body with the reason. Do not make a change you
believe is wrong in order to close a comment, and do not silently skip a finding
you disagree with - an unexplained non-change is indistinguishable from an
oversight.

Do not fix anything the findings did not raise. Do not reformat, do not tidy
adjacent lines, do not improve something you noticed on the way. A later agent
judges this branch against what was asked for and lists every change nothing
asked for, by location, in a public comment.

## Committing

Stage by explicit path - never `git add -A`, `.` or `-p`. One commit for the
whole round of fixes. Conventional-commits subject in the imperative; the body
lists each finding and what you did about it, including each rejection and its
reason.

Confirm with `git status --porcelain` and `git log --oneline` that the commit is
on the branch and that nothing is left unstaged.

If every finding was rejected, or there were none, there is nothing to commit,
and that is a valid outcome. Say so explicitly in your final output instead of
manufacturing a commit.

## Finishing

You get one attempt. There is no second iteration.

When every finding has been fixed or rejected, print this exact line and nothing
after it:

FIXES COMPLETE
