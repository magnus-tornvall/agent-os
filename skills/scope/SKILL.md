---
name: scope
description: Fix what a change may touch before it is written - a written list of paths, the rule for what counts as a consequence of the request, and where a widening or an out-of-scope finding is recorded. Use when a change is about to be implemented and what it is allowed to reach has not been pinned down, or when a review is arguing about drift.
disable-model-invocation: true
---

# scope

Scope is decided before the change, not defended after it. The product is one list of
paths and the rules that say when something may join it, so a reviewer asking "why is this
file here" has an answer to read rather than an argument to have.

## The scope is a list of paths, written down before the change

Not an intent, not a summary of the area, not "the auth code". Paths, in the order they
will be touched, with the reason each one is on the list.

Written down means it exists outside the head of whoever is implementing: in the plan, in
the issue. A scope nobody wrote down is one nobody can be held to, and every later argument
about drift becomes an argument about what was meant.

Check: point at the list. A change whose scope cannot be pointed at has none.

## A mechanical consequence is in scope; convenience is not

The list names the change's targets. What the targets force is already inside it and does
not need listing:

- A signature that changed, updated at its call sites. Leaving one uncompiled is not a
  narrower change, it is a broken one.
- An import moved because the thing it names moved.
- A test covering the new behaviour, and an existing test the new behaviour makes wrong.
- The generated or lock file the change's own tooling rewrites.

What became convenient while the files were open is a different change:

- A refactor of code the change did not otherwise touch.
- A formatting or lint sweep over lines the change did not otherwise alter.
- A rename - of a symbol, a file, a config key - that nothing in the request requires.
- A new abstraction with one call site.
- An unrelated bug noticed in a file the change happens to open.

Check: for each hunk outside the written list, name what in the request forced it. No
answer means it is convenience, and convenience comes out.

## Widening is a decision with a record, not a silent edit

The bar is completion: the requested change cannot be finished without the addition. Not
that the result would be better with it, not that the addition is small, not that it is
adjacent. A widening that clears the bar is legitimate, and one that clears it is
discovered rather than invented - a caller the search missed, a schema the new field needs,
a helper that must exist for the new path to run at all.

Legitimate or not, it is recorded where the change is explained. Where there is somebody to
ask, ask, and the answer is the record. Where there is nobody - an unattended run, a
prompt with no author on the other end - the reason goes in the commit message with the
widening it justifies, and that is the record. Silence is the failure mode either way: a
scope that grew without a sentence saying why is indistinguishable from drift, because
that is what drift is.

Check: every path in the diff is on the written list, is a mechanical consequence of one
that is, or has a recorded reason. Three answers, no fourth.

## The out-of-scope thing you found is real work, filed elsewhere

Finding it is worth something. Fixing it here is not, because it arrives with no reason in
the record and it makes the change's diff argue for two things at once.

So it goes where work goes in this repository - an issue, the plan, the non-goals of the
change that is shipping - named specifically enough that whoever picks it up does not have
to find it again: the path, what is wrong, what it would take. Then it is left undone.
Leaving it undone is the correct outcome of this change, not a debt this change incurred.
A change that ships its own scope and files what it found is complete.

Check: nothing in the diff is there because it was noticed rather than requested, and
nothing noticed was dropped without being written somewhere.

## Prohibitions

- Does not decide what the change should do. It decides only what the change may touch.
- Does not write the change, plan it, or review it.
- Does not widen a scope on its own reasoning, or accept "while I was in there" as one.
- Does not fix the out-of-scope thing it found, and does not forget it either.
