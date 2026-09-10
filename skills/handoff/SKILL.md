---
name: handoff
description: State how unfinished work is passed on - what is done, what is not, what was decided and why - so the next agent or person resumes from a written record instead of inferring intent from a half-finished tree. Use when work stops before it is finished: a session ending, a handover, a branch left mid-change.
disable-model-invocation: true
---

# handoff

Work stops unfinished more often than it lands finished, and the next reader gets
whatever was written down. A half-finished tree is not a record: it shows where the work
stopped and nothing about why, so its reader reconstructs intent from diffs and gets it
wrong in the expensive direction - redoing what was deliberate, or finishing what was
left out on purpose.

Three rules. Each one is something a handoff is checked against before it is handed over,
and a handoff that fails one is not shorter than a handoff that passes, it is just
unreadable later.

## A handoff names what is done, what is not, and what was decided

All three, as three lists rather than a narrative. **Done** is what holds and needs no
further work. **Not done** is what remains, named specifically enough to start on - a
file, a call site, a failing case, never "finish the tests". **Decided** is every choice
already made that the remaining work has to respect.

Two of the three is worse than none, because it reads complete. Omitting what is not done
presents unfinished work as finished. Omitting what was decided leaves the reader unable
to tell an unfinished part from a deliberately excluded one - the two are identical in a
tree - so the reader guesses, and either rebuilds a branch that was cut on purpose or
fills a gap that was meant to stay a gap. Either guess costs more than writing the list
cost.

**Check**: three headings, each populated. An empty one is an answer - "nothing was
decided" - and it is written as one rather than left off.

## A decision without its reason is not handed over

A decision reaches the next reader as a constraint they can see and an argument they
cannot. The code shows what was chosen; the reason it beat the alternative is nowhere. So
the reader re-litigates it - and usually reverses it, because the case against is in
front of them and the case for is not. Reversing it is not the whole cost: the work
already built on it is what breaks.

Nobody will be there to ask. The reason goes in the commit body of the commit that
carries the decision, where it stays attached to the change it justifies and travels with
it. A reason held in a chat log, a ticket comment or the author's head is recorded
nowhere that the next reader will look.

**Check**: every entry in the decided list says what it ruled out and why, and that
sentence exists in a commit body rather than only in the handoff.

## An uncommitted change is not handed over at all

The working tree is not a channel. Uncommitted edits, a stash, an untracked file - none
of it is addressable by anyone who does not already have that checkout, and the next
reader does not. Only what is committed, or written down, reaches them.

This bounds the other two rules. A decision explained in a commit that was never made is
a decision recorded nowhere, and a "done" item that lives in unstaged edits is not done.

**Check**: `git status --porcelain` is empty. Anything it still lists is either committed
or named in the handoff as work that does not survive.

## What it does not do

The skill produces the record, not the work.

- Does not do the remaining work, plan it, or estimate it.
- Does not decide what ships. What was already decided is reported, not reopened.
- Does not replace the issue, the plan or the review. It says where the work stopped.
