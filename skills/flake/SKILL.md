---
name: flake
description: Decides what happens to a test that fails intermittently - fix the nondeterminism, quarantine it with a named owner and a stated end, or delete it and say what coverage went with it - for use when a test has failed and passed on the same code, when a re-run is being proposed as the remedy, or when a retry is about to be added to make CI green.
disable-model-invocation: true
---

# flake

A test that fails intermittently has already told you something true. This skill decides
what happens next, and it produces exactly one of three endings. Re-running until green is
not among them.

## A flake is a finding about the system

The nondeterminism is real until proven otherwise. The test observed it; the test did not
invent it. Treating the test as the defect is a conclusion, and it is the one conclusion
that requires evidence nobody has gathered yet.

Check the finding against where nondeterminism actually comes from, in this order, because
the earlier ones are the common ones:

- **Shared mutable state between tests** - a database row, a file, a cache, a module-level
  singleton, a static field that one test writes and another reads.
- **Ordering dependence** - the test passes in the order it was written in and fails in the
  order the runner chose. Run it alone, then run it in a shuffled suite.
- **An ambient clock** - `now`, a timezone, a date boundary, a timeout measured against
  wall time on a loaded machine.
- **A sleep standing in for a wait** - a fixed delay where the condition should have been
  polled or awaited. It is not a fix that is slightly slow; it is a race whose loser
  changes with the machine.
- **Randomness** - an unseeded generator, a hash order, a UUID that sorts.
- **A call to something the suite does not control** - a network service, the real
  filesystem, another process, a queue.

Each of these is a defect in something. Which something - the test, the harness, or the
system under test - is the question worth answering, and it is answerable. A flake whose
source is unexamined is not a flaky test, it is an unread bug report.

## Re-running is not a decision

A green re-run is evidence of nothing. It is one more sample from a distribution already
known to contain both outcomes, and the failure it followed is still unexplained. "It
passed the second time" describes the sampling, not the system.

A retry added to make CI pass converts a known defect into an unknown one. Before the
retry, the suite reported the nondeterminism on every occurrence. After it, the suite
reports nothing, the occurrences continue, and the next person to see the symptom sees it
in production with no test pointing at it. The retry did not reduce the failure rate; it
reduced the observation rate, and it is the observation that was doing the work.

This holds for anything that has the same effect under another name: a rerun-failed flag, a
retry annotation, a loop around the assertion, a widened tolerance chosen to stop the
failing rather than to state the real bound.

## There are exactly three endings, and one is chosen now

Not after another run, not after it happens again. The decision is made on the evidence
already in hand, and the cost of each ending is what makes it a choice.

**Fix the nondeterminism.** Remove the source found above: isolate the state, seed the
generator, inject the clock, await the condition, fake the thing the suite does not own.
Costs the most now and nothing afterwards. This is the default, and departing from it needs
a reason that survives being written down.

**Quarantine the test.** It stops gating, and the coverage it provided stops existing until
someone returns to it. Costs a real hole in the suite for as long as the quarantine lasts,
which is why it is bounded.

Quarantine is a promise, not a comment. It requires three things, and it is not a
quarantine without all three:

- **A named owner** - a person, not a team and not the author of the last commit.
- **A stated end** - a date or a release, written where the quarantine is. A quarantine
  with no end is a deletion that still costs CI time.
- **A link to the issue tracking the fix** - the issue holds the evidence, the suspected
  source, and the failure rate, so whoever returns does not start over.

An expired quarantine is not a flake any more; it is one of the other two endings, taken
late.

**Delete the test.** Costs the coverage permanently and immediately, which is honest, and
it is the right ending more often than the suite's size suggests.

## A deleted test says what coverage went with it

A delete is legitimate only when what the test asserted is one of three things, and the
deletion says which:

- **Untrue** - the assertion was wrong, or the behaviour it pinned is no longer the
  behaviour anyone wants. Then the test was reporting a real disagreement and deleting it
  settles it.
- **Covered elsewhere** - another test asserts the same property. Name it. "Probably
  covered by the integration suite" is not a name.
- **Knowingly uncovered** - nothing asserts it now, and that is an accepted risk. Write it
  down where the risk is tracked, not in the commit message where it will not be found
  again.

A delete that fits none of these is not a delete, it is a silent reduction in what the
suite knows. The check is whether a reader six months later can tell which of the three
happened without asking the person who did it.

## What this skill does not do

- Does not diagnose the underlying bug. It decides the test's ending and names the
  suspected source; the fix is its own work.
- Does not judge a suite, a coverage number, or a testing strategy. One test at a time.
- Does not accept "watch it for a while" as an ending, or a re-run as evidence.
- Does not touch git, CI configuration, or the issue tracker.
