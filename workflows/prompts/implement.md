# Implement one issue

You are running unattended in a git worktree of the `agent-tools` repository, on
branch `{{SOURCE_BRANCH}}`. Nothing else is running. Nobody will answer a
question, so do not ask one — decide, and record the decision in the commit
message.

The issue below has already been claimed on your behalf. **Do not touch GitHub.**
No `gh`, no issue edit, no pull request, no comment. The process that started you
owns every GitHub call it makes; a call from you would duplicate or contradict
one of them.

Do not push. Commit locally on `{{SOURCE_BRANCH}}` and stop there.

## The issue

### #{{ISSUE_NUMBER}} — {{ISSUE_TITLE}}

{{ISSUE_BODY}}

## How to work

Read before you write. This repository has conventions that are visible only in
the files that already follow them, so find the nearest existing example of the
thing the issue asks for and match it — structure, frontmatter, heading depth,
voice, line width. A file that is correct but reads as foreign to the repo is a
finding waiting to be written against you.

Then implement exactly what the issue asks. Not the generalisation of it, not the
first half of it. If the issue names a path, use that path. If it names a
constraint, satisfy it and make it visible that you did.

Commit your work with `git add <explicit paths>` followed by `git commit`. Stage
by path — never `git add -A`, `.` or `-p`. One commit is right unless the change
genuinely has two independent parts. Write a conventional-commits subject in the
imperative, under about 72 characters, and let the body say why rather than what.

Before you commit, run `git status --porcelain` and confirm that everything you
meant to add is staged and nothing you did not mean to add is.

## Finishing

Your work is only visible to the next stage through commits, so an uncommitted
change is a lost change. Verify with `git log --oneline` that your commit is on
the branch.

When the issue is implemented and committed, print this exact line and nothing
after it:

IMPLEMENTATION COMPLETE
