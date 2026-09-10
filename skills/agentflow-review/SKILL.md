---
name: agentflow-review
description: Review an open pull request against the issue it claims to close, posting one comment per finding and printing whether it was clean. The review phase of the agentflow run; invoked by the agentflow orchestrator skill with the issue text and pull request number in its prompt.
---

# Review a change you did not write

## Your values

The prompt that invoked you carries these keys. Read them from there.

- `WORKTREE` - the absolute path you work in. `cd` there first.
- `BASE_BRANCH` - what the change is diffed against.
- `PR_NUMBER` - the open pull request.
- `ISSUE_NUMBER`, `ISSUE_TITLE`, `ISSUE_BODY` - what was asked, in full.

If any of them is missing from your prompt, stop and say which.

## The frame

You are running unattended. A different agent wrote the change under review and
you have none of its context - which is the point. You know what was asked and
you can see what landed. Judge the second against the first.

You post your own findings, and that is the only GitHub call you make. No
review, no approval, no label, no issue edit. Do not commit and do not push -
you are reading, not fixing.

## What was asked

It is in your prompt under `ISSUE_NUMBER`, `ISSUE_TITLE` and `ISSUE_BODY`.

## What landed

Read the diff:

    git diff <BASE_BRANCH>...HEAD

and the commits:

    git log --oneline <BASE_BRANCH>..HEAD

Read every file the diff touches in full, not just the changed hunks - a change
is wrong in context more often than it is wrong in isolation. Then read the
nearest existing file of the same kind that the change did *not* touch, so you
know what this repository's convention actually is rather than what the change
assumed it was.

## What counts as a finding

Something a reviewer would block on or ask to be changed:

- A stated constraint in the issue is violated.
- The change contradicts a convention the repository visibly follows elsewhere,
  and you can name the file that shows the convention.
- The content is wrong, self-contradictory, or promises behaviour it does not
  describe.

Not a finding: taste you cannot ground in the issue or in an existing file;
restating what the change does; praise; a suggestion to add tests to a change
with nothing executable in it; anything you would preface with "consider".

Be sparing. Between zero and five findings. Zero is a legitimate answer and a
better one than a padded list - every finding you write becomes a public comment
on a public repository and then becomes work for the next agent, so a weak
finding costs twice. Rank the strongest first.

## How to post

One comment per finding, strongest first, each posted with:

    gh pr comment <PR_NUMBER> --body '<the comment>'

Every comment has exactly this shape:

    **Finding N of M — one line, imperative, what to change**

    `path/relative/to/repo/root:12`

    What is wrong, the evidence for it, and what correct looks like. Cite the
    file that establishes the convention when the finding rests on one. Two to
    five sentences.

`N` counts from 1 and `M` is the total you are posting, so the next agent can
tell a partial set from a complete one. Drop the location line rather than
guessing at a file or a line, and drop `:12` rather than guessing at a line in a
file you are sure of. Nothing else goes in the comment - no summary comment, no
preamble, no sign-off, and no second comment repeating the set.

Post every finding before you print anything. A finding you decided on but did
not post does not exist.

## Finishing

You get one attempt. There is no second iteration.

Print exactly one of these two lines, and nothing after it.

If you found nothing and posted nothing:

REVIEW CLEAN

If you posted one or more findings:

REVIEW FINDINGS POSTED

These two lines are how the orchestrator knows you finished. Printing neither
means it cannot tell your silence from a crash, so it reports the run as needing
a human and nothing acts on the pull request. Printing the wrong one is less
damaging than it used to be - the next phase reads your comments rather than
your signal - but it still misreports the run.
