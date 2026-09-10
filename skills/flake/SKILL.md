---
name: flake
description: Decide what happens to a test that fails intermittently - fix the nondeterminism, quarantine it behind a named owner and a stated end, or delete it and say what coverage went with it. Use when a test failed and then passed on a re-run, when the same test is red again in CI, or when someone proposes a retry.
disable-model-invocation: true
---

# flake

A test that fails intermittently has already reported something true. This skill decides
what happens to it, and the decision ends in exactly one of three places - fixed,
quarantined, deleted. It never ends in "run it again".

Each rule below is a check. A decision that cannot answer it is not made yet.

## A flake is a finding about the system, not about the test

The nondeterminism is real until proven otherwise. Something in the system under test, in
the suite around it, or in what either of them reaches can produce two answers from the
same input, and the test is the thing that noticed. Treating the test as the defect
assumes the conclusion.

**The check: name the source.** It is almost always one of these:

- shared mutable state between tests - a database row, a singleton, a module-level cache,
  a temp file that two tests both write
- ordering dependence - the test passes in isolation and fails after another, or the
  suite parallelises and the order stopped being fixed
- an ambient clock - `now()` read at two points, a date boundary, a timezone, a timeout
  measured against wall time
- a sleep standing in for a wait - a fixed delay where the condition should be polled or
  awaited, which fails when the machine is slower than the number
- randomness - an unseeded generator, a random port, a hash iteration order, a fixture
  built from a random identifier
- a call to something the suite does not control - the network, a shared environment, a
  real clock service, another team's staging deployment

"No idea" is not a source. It is an investigation that has not finished, and it does not
license a decision - though it is a legitimate reason to quarantine while the
investigation runs, on the terms below.

## Re-running is not a decision

A green re-run is evidence of nothing. It is one more sample from a distribution already
known to contain both outcomes, and the failure rate it establishes is the one the first
red already established.

**The check: has anything about the system changed since the red?** If nothing has, the
green says nothing, and the test is still failing intermittently.

A retry added to make CI pass is worse than no decision. It converts a known defect into
an unknown one: the signal that something is nondeterministic is exactly what the retry
consumes, and afterwards the failure rate is invisible until it crosses whatever the
retry count is. The system is not more correct; it is less observable.

## There are exactly three endings, and one is chosen now

Fix, quarantine, or delete. Leaving the test red and re-running is not a fourth ending,
it is the absence of one.

**Fix the nondeterminism.** Remove the source named above - isolate the state, pin the
clock, wait on the condition rather than the duration, seed the generator, fake what the
suite does not own. It costs the investigation and the change, and it is the only ending
that removes the defect rather than relocating it. A fix is not confirmed by one green
run; it is confirmed by the source being gone.

**Quarantine the test.** It stops blocking, and the coverage it carried stops existing
until it comes back. That is the cost, and it is paid for as long as the quarantine lasts.

Quarantine is a promise, not a comment. It requires three things, all written down where
the skip is:

- **a named owner** - a person, not a team and not the author of the commit that
  quarantined it
- **a stated end** - a date or a release, after which the quarantine is itself a failure
- **a link to the issue tracking the fix** - the issue is the work; the skip is only the
  marker

A quarantine missing any of the three is a delete that has not admitted it, and should be
argued as a delete instead.

**Delete the test.** The coverage goes permanently and the maintenance goes with it. It is
the right ending more often than it is chosen, and it is legitimate only under the next
rule.

## A deleted test must say what coverage went with it

Deleting a flake is deleting an assertion. The delete is legitimate when what the test
asserted is one of exactly three things, and the commit body says which:

- **untrue** - the behaviour it asserted is not the behaviour the system should have, so
  the test was wrong before it was flaky
- **covered elsewhere** - another test asserts it, named by path so the claim can be
  checked
- **knowingly uncovered** - nobody will assert it, and that is written down where the
  next person looks, not left as an absence for them to discover

**The check: which of the three, and where is it written?** A delete that cannot answer
that is not a delete, it is coverage loss with a commit message on it.

## What this does not do

- Does not debug the test or write the fix. It decides which ending the test gets.
- Does not judge whether the suite is worth having, or design the suite around it.
- Does not touch CI configuration, retry settings, or the quarantine mechanism the
  project already uses.
- Does not track quarantines. The stated end and the issue are what do that.
