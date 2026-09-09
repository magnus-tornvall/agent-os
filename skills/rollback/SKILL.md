---
name: rollback
description: Decide whether to roll back or roll forward while a bad deploy is live and the clock is running. Tests whether the rollback is itself reversible, names the effects that are not, and says what evidence to capture before the rollback destroys it. Use mid-incident, before the cause is known, when the only open question is which direction reaches a working system first.
disable-model-invocation: true
---

# rollback

It decides direction, not cause. Mid-incident there is one question worth answering -
does going back reach a working system faster than going forward - and it turns on the
deploy, not on the bug. The cause is postmortem work; deciding needs none of it.

Two failure modes are what this skill exists against. Rolling back a deploy whose effects
do not reverse, which converts one outage into a second one nobody has a plan for. And
debugging forward with users down, because the fix feels close - which it always does,
and which is not a claim about the clock.

## The rule

One input: **is the rollback reversible?**

- **Yes** - roll back now, before the cause is known. Not knowing why is not a reason to
  wait; the rollback is the same either way.
- **No** - roll forward. The deploy has left state behind that going back does not undo,
  so the incident is a state problem now and the old artifact does not fix it.
- **Unknown** - treat it as no. See [When reversibility is
  unknown](#when-reversibility-is-unknown).

The rule takes no other input. Not how bad the symptom is, not how confident anyone is in
the fix, not how long the rollback takes - a slow reversible rollback still beats a fast
forward fix that has to be written first. Severity changes how much of the system you
turn off while you decide; it does not change the direction.

**Diagnosis is not an input, and it is not a stage.** Reversibility is answerable from the
diff and the deploy's own record. The cause is not answerable on any clock you control,
which is why one gates the decision and the other cannot. "Ten more minutes and I'll know"
is the second failure mode saying its own name.

Rolling back is not a verdict on the change. It is putting the system back on the last
artifact known to serve traffic, and it survives being wrong about why.

## The reversibility test

Reversible means: deploy the previous artifact and the system is in the state it was in
before, with nothing left behind that the previous artifact cannot handle.

It is **not reversible** when the deploy either destroyed information that cannot be
reconstructed, or emitted an effect across a boundary you do not control. Those two
properties are the test. The classes below are what they look like:

- **A migration that dropped a column or table.** The data is gone, and the old code reads
  a schema that no longer exists. Rolling back the code without the schema is not a
  rollback, it is a third state neither artifact was written for.
- **A consumed queue message.** Acknowledged is final; the broker will not redeliver
  because the old code is back. The messages the bad deploy ate stay eaten.
- **A published event.** Downstream consumers already acted on it, in systems your deploy
  pipeline does not reach. Your rollback moves your service and leaves their state where
  the event put it.
- **A cache warmed with bad data.** Rolling back the writer stops new bad values; it does
  not evict the ones already serving. Until they expire, the old artifact serves the new
  bug.

Anything that only wrote rows the previous artifact still understands, or ran additively -
a column added, a nullable field, a new table - is reversible. Additive is the whole
reason for that convention.

**Partly reversible is not reversible.** The common shape is a deploy whose code reverts
cleanly and whose migration does not, and the trap is that the code rollback is the part
that is easy to run. Reverting only the reversible half leaves the old artifact against
mutated state, which is a fault mode nobody has ever tested. Either the reverted code
tolerates the state that was left behind - and someone must say so, not assume it - or the
rollback does not go.

## When reversibility is unknown

Mid-incident this is the normal case, not the edge. Nobody remembers what was in the
deploy, the migration list is in a build log, and the person who wrote it is asleep.

**Unknown is treated as not reversible.** Roll forward. The asymmetry is the reason: an
unnecessary roll-forward costs time on an outage that is already happening, while a
rollback that turns out to be irreversible starts a second incident with destroyed data
underneath it. Those are not the same size, so the default goes to the recoverable
mistake.

One bounded exception. Unknown becomes yes when someone reads the actual deploy diff and
finds no migration, no consumer, no publisher and no cache write - a positive answer from
the diff, not an absence of memory. It is a lookup with an end, so give it minutes and a
name. If it is still unknown when the time is up, it is a no, and it stays a no; asking
again later is how a bounded lookup becomes the debugging session the rule forbids.

**Not reversible and no forward fix in sight is a third answer, and it is not a rollback.**
Reduce what the system is doing until it is serving something correct - shed the failing
path, disable the feature, take the writer offline, serve degraded - and keep the forward
fix as the only work in flight. A rollback nobody can guarantee is not the safer option
merely because it is the one with a button.

## Capture before you roll back

A rollback destroys the running system that produced the failure. Whatever the postmortem
needs, it needs it from a process that no longer exists.

Capture, in this order:

- **The artifact identity** - commit SHA, image tag, build number, and the deploy's own
  record. After the rollback nothing in the environment points at it.
- **Timestamps** - deploy start, first symptom, decision. The correlation is the finding,
  and it is the first thing that cannot be reconstructed from anything else.
- **Logs and traces off a bad instance**, pulled before it is replaced. Not a dashboard
  view - a query with an explicit time window, saved somewhere retention will not reach.
- **One live process's state** - heap or thread dump, a sample of in-flight requests.
  This exists only while the bad artifact is running, and only here.
- **Config and feature flag values as they stand.** Rollback moves them too, and after it
  moves them nobody can prove what they were.

**Capture is bounded and it runs alongside the rollback, never in front of it.** One
person captures while another rolls back. Alone, take the artifact identity and the
timestamps - seconds, not minutes - and go; those two are what makes the rest findable
later, and the rest is worth less than the outage it would have extended.

## Prohibitions

- Does not diagnose the failure. The cause does not enter the decision.
- Does not wait for a diagnosis, or accept a nearly-finished fix as a reason to go
  forward.
- Does not roll back on an unknown, and does not turn the bounded diff lookup into an
  investigation.
- Does not roll back a partly reversible deploy on the strength of the half that reverts.
- Does not let capture delay the rollback.
- Does not run the rollback, own the incident, or communicate it.
- Does not write the postmortem, or decide what the fix should be.
