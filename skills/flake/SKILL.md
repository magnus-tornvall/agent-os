---
name: flake
description: Decide what happens to a test that fails intermittently - fix the nondeterminism, quarantine the test with a named owner and a stated end, or delete it and say what coverage went with it. Use when a test has failed and passed on the same code, when a re-run is being proposed as the remedy, or when a retry is about to be added to make CI green.
disable-model-invocation: true
---

# flake

It decides. A test that fails intermittently gets one of three endings, chosen now, and
"run it again" is not one of them.

Each section below is a rule. A decision about a flaky test is checked against all four,
and a decision that fails one is not made yet.

## A flake is a finding about the system

The nondeterminism is real until proven otherwise. The test is the instrument that
reported it, and blaming the instrument is a conclusion, not a starting point - it has to
be earned by naming the mechanism that makes the test wrong about a system that is right.

Where it usually comes from, and the list to walk before anything is called a test-only
problem:

- **Shared mutable state between tests** - a database row, a singleton, a cache, a file on
  disk, an environment variable that one test writes and another reads.
- **Ordering dependence** - the test passes in the order it was written in and fails when
  the runner picks another, or in isolation, or in parallel.
- **An ambient clock** - `now` read from the machine, a date boundary, a timezone, a
  timeout measured against real time.
- **A sleep standing in for a wait** - a fixed delay where the condition should have been
  waited on. It is not slow-and-correct, it is a race that usually wins.
- **Randomness** - an unseeded generator, a hash or set iteration order, a random port, a
  generated identifier that sometimes collides.
- **A call to something the suite does not control** - a network service, a clock server,
  a shared queue, a package registry, another team's environment.

Checkable: the decision names which of these it is, or names the mechanism that makes the
test wrong about a correct system. "Flaky" on its own names neither.

## Re-running is not a decision

A green re-run is evidence of nothing. It is one more sample from a distribution that was
already known to contain both outcomes, and it changes the estimate of neither. The red
run is the observation; the green run does not retract it.

A retry added to make CI pass converts a known defect into an unknown one. Before it, the
suite reported a real intermittency at a known place. After it, the intermittency is still
there and nothing reports it - the signal was spent to buy the green, and what remains is
a system whose nondeterminism now surfaces in production instead of in CI.

Checkable: the decision is one of the three endings below. Re-running to see what happens
is diagnosis and belongs under the first rule; re-running as the remedy is this rule being
broken.

## There are exactly three endings, and one is chosen now

### Fix the nondeterminism

Remove the cause: seed the generator, inject the clock, wait on the condition, isolate the
state, fake the thing the suite does not own. Costs the time to find and remove a real
defect, which is unbounded up front - and it is the only ending that leaves both the test
and the system correct.

### Quarantine the test

Take it out of the signal so it stops failing the build. Costs the coverage for as long as
it lasts, and the assertion nobody is watching is now a place where a regression lands
silently.

**Quarantine is a promise, not a comment.** A skip with a sentence next to it is a
deletion that still costs CI time. It requires three things, all written down where the
quarantine is:

- **A named owner.** A person, not a team and not the author of the last commit.
- **A stated end.** A date or a release the quarantine does not outlive. Not "until we get
  to it".
- **A link to the issue tracking the fix.** The issue carries the finding from the first
  rule, so whoever picks it up does not start from "it's flaky".

Missing any of the three, the ending is not quarantine. It is one of the other two.

### Delete the test

Costs the coverage permanently and honestly. It is the right ending more often than it is
chosen, because a test asserting something untrue is worse than no test.

Checkable: exactly one of the three is chosen, before the change lands, and the choice is
recorded where the next reader of the test finds it.

## A deleted test says what coverage went with it

The delete is legitimate in exactly three cases, and it names which one:

- **What it asserted is untrue** - the test encoded a behaviour the system never promised,
  or no longer promises. The finding is that the assertion was wrong.
- **It is covered elsewhere** - another test asserts the same thing deterministically, and
  the delete names it.
- **It is knowingly uncovered** - nothing else asserts it, nothing will, and that is
  written down rather than discovered later by whoever trusted the suite.

Checkable: the delete names one of the three. A delete that names none is the coverage
disappearing without anybody deciding to lose it.

## What this does not do

It does not diagnose the defect, write the fix, or write the replacement test. It does not
judge whether the assertion is worth having - that is the author's call. It decides the
ending and what the ending owes, and it stops there.
