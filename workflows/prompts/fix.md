# Apply review findings

You are running unattended in a git worktree of the `agent-tools` repository, on
branch `{{SOURCE_BRANCH}}`. The findings below were left as comments on pull
request #{{PR_NUMBER}} and read back from GitHub for you. Nobody will answer a
question, so decide and say why in the commit message.

**Do not touch GitHub.** No `gh`, no comment, no reply, no resolve. The process
that started you owns every GitHub call. Do not push; commit locally and stop.

## The findings, as they were read back from the pull request

{{FINDINGS}}

## What to do

Take each finding in turn. Read the file it names — and the surrounding code or
prose, not just the cited line — before deciding what the fix is.

Then do one of two things, and nothing else:

**Fix it.** Make the smallest change that addresses the root of the finding
rather than its symptom. If the finding is right about a problem but wrong about
the remedy, fix the problem.

**Reject it.** A finding can be wrong. If it is, leave the file alone and record
the rejection in the commit body with the reason. Do not make a change you
believe is wrong in order to close a comment, and do not silently skip a finding
you disagree with — an unexplained non-change is indistinguishable from an
oversight.

Do not fix anything the findings did not raise. Do not reformat, do not tidy
adjacent lines, do not improve something you noticed on the way. Scope creep here
lands in a pull request that has already been reviewed once, where nobody is
looking for it.

## Committing

Stage by explicit path — never `git add -A`, `.` or `-p`. One commit for the
whole round of fixes. Conventional-commits subject in the imperative; the body
lists each finding and what you did about it, including each rejection and its
reason.

Confirm with `git status --porcelain` and `git log --oneline` that the commit is
on the branch and that nothing is left unstaged.

If every finding was rejected there is nothing to commit, and that is a valid
outcome. Say so explicitly in your final output instead of manufacturing a
commit.

## Finishing

When every finding has been fixed or rejected, print this exact line and nothing
after it:

FIXES COMPLETE
