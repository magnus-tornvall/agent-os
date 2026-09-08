---
name: postmortem
description: Write a blameless incident postmortem once the incident is over and the fix is in. Reconstructs a timestamped timeline from evidence, separates what was true from what responders believed, reports contributing factors rather than one root cause, and produces action items that are each owned, dated and falsifiable. Use when the job left is working out what happened and what changes so it does not happen the same way twice.
---

# postmortem

It reconstructs. The method is a timeline assembled only from artefacts that carry a
timestamp, then the smallest set of factors that accounts for every entry in it, then the
changes that would have broken the chain. What survives is a document someone who was
asleep that night can read and act on.

Two failure modes are what this skill exists against, and everything below is aimed at one
of them. The first is naming a person as the cause, which ends the investigation at the
last human to touch the system. The second is stopping at the first plausible cause, which
ends it at an explanation that fits some of the timeline and is never tested against the
rest.

Invoke it after the incident, not during. An incident still burning needs responders, not a
historian; asked for a postmortem while impact is ongoing, say so and stop. The fix being
in is part of the gate too - a postmortem written before the mitigation is understood
proposes actions against a system that is still moving.

This skill touches no git and writes no files. The postmortem is prose it reports, and the
user decides where it lives.

## Blamelessness

Blameless is a constraint on the causal claim, not a tone. Softening the language while
still pointing at a person produces the same document with worse evidence. The rule is
that a human action never terminates a chain: it is the thing to be explained, and what
explains it is the information available, the tooling, the pressure and the incentives that
made it the reasonable move at the time.

The test is substitution. Put any competent colleague in that seat with the same
dashboards, the same alert text, the same time of night and the same pressure to restore
service - if the outcome is unchanged, the person was not the cause and never was. If the
outcome does change, the difference is a fact about the system: what did the other
colleague know, or have, or see. That difference is the factor. Name it, not them.

Roles, not names, and only where the role carries information. "The on-call engineer" says
that whoever held the pager could act; "the deploy author" says who had context nobody else
had. A name in a timeline entry adds nothing an investigation can act on and changes who is
willing to answer the next question.

## The timeline

### Evidence first

Every entry carries a timestamp, a timezone, and where it came from - the log line, the
alert, the graph, the deploy record, the chat message. An entry nobody can trace back is a
recollection, and a recollection reaches the timeline only when it is labelled as one.

Build it before forming a story. A timeline assembled to support an explanation stops
collecting once the explanation is covered, and the entries it never went looking for are
exactly the ones that would have broken it. Collect the whole window first, including the
hours before onset: the change that armed the failure is usually older than the failure.

Absence is an entry. An alert that should have fired and did not, a graph with no data, a
health check that kept passing - the gap has a timestamp too, and it is often the most
expensive line in the document.

### What was true and what was believed

Two parallel tracks, kept visibly separate. One is what the system was actually doing,
written with the knowledge available now. The other is what responders believed at each
moment, written with the knowledge available then.

Collapsing them is what makes a postmortem read as an indictment. Judged against what is
known now, every wrong turn during the incident looks careless; judged against what was on
the screen at the time, most of them look correct, and the divergence between the two
tracks is the finding. Each divergence is a question: what was the system telling
responders that was misleading, incomplete or absent.

Write the belief track in the responders' own terms, including the hypotheses that turned
out wrong and when each was abandoned. A discarded hypothesis that consumed twenty minutes
is a measurement of how legible the system is under failure.

### Three clocks

Detection, diagnosis and mitigation are separate durations, measured separately, and a
postmortem that reports only total impact time cannot say which of them to fix.

**Detection** runs from onset - the first moment behaviour was wrong, not the first moment
anyone noticed - to the moment a human knew. It measures monitoring, and it is the only
clock that customers can start; a detection time set by a customer report is a finding on
its own.

**Diagnosis** runs from knowing to understanding enough to act. It measures how legible the
system is while failing: what the tooling shows, whether the signals distinguish causes,
how much had to be inferred. This clock is where the belief track earns its place, because
each abandoned hypothesis is a segment of it.

**Mitigation** runs from understanding to impact ending. It measures capability, not
knowledge - whether a rollback existed, whether a flag could be flipped, whether anyone had
the access. A long mitigation clock behind a short diagnosis clock is a tooling problem and
nothing else.

Report the three with the onset moment named and defended, because every clock is measured
from it and it is the number most often assumed rather than established.

## Contributing factors

There is no root cause. An incident that reached production passed every control that was
supposed to stop it, and each of those is a factor: what introduced the fault, what let it
through, what failed to detect it, what made it worse, and what slowed the response. A
document with one cause has quietly nominated whichever factor was found first.

Each factor is stated as a mechanism and tied to the timeline entries it explains. A factor
that explains no entry is a theory; an entry no factor explains is the investigation still
open, and saying so is better than a document that reads complete and is not.

The set is tested for sufficiency and for necessity, in that order. Sufficiency: walk the
timeline and check that every entry, including the absences, is accounted for by something
in the set. Necessity: remove one factor and ask whether the incident still happens - if it
does, that factor is context worth writing down, not a contributing factor, and the
distinction stops a list of everything imperfect from crowding out the few things that
mattered.

### When to stop asking why

Ask why of each factor and keep asking while the answer names a mechanism or a decision
this organisation controls. Stop at the first answer that does not, and record the last
controllable answer as the factor.

Two answers fail that test and both are stopping points. One names a person's disposition -
careless, inexperienced, rushing - which is the blame failure arriving under a different
name; when a why lands there, the chain went through a human action without explaining it,
so go back one step and explain it. The other names a condition outside this
organisation's reach - a provider's behaviour, physics, a third party's release schedule.
That is a real boundary, and what is controllable is the response to it: the factor becomes
the missing timeout, the absent fallback, the unowned dependency.

The other stopping point is repetition. When the next why returns an answer already
recorded against another factor, the chains have converged and the shared answer is the
factor both of them reduce to. Stop there and say so, because a convergence is the most
valuable thing this section produces: it is one change that closes two paths.

## Action items

An action item names an owner, a date, and a completion condition an outsider could check
on that date and call done or not done. All three, on every item, or it does not go in the
list.

The owner is one person who has agreed to it. A team is not an owner, and an owner assigned
in their absence is a guess about someone else's quarter. The date is a date, not a
quarter or a "soon". The completion condition is falsifiable: something that is true or
false, not better or worse.

Each item also names the factor it addresses and which clock or link it breaks - it
prevents the fault, it stops the fault reaching production, it shortens detection, it
shortens diagnosis, it shortens mitigation, or it reduces the impact. An item that cannot
say which is not addressing this incident.

**The bar for rejection.** An item that cannot be marked failed is a wish. "Be more
careful", "improve monitoring", "consider adding retries", "document the runbook better" -
none of these can be assessed on their date by anyone but their author, which means they
will be assessed by nobody. Reject the wish and ask the narrower question: what would have
to exist for this to have gone differently, and who is going to make that thing exist. An
alert on this metric at this threshold routing to this pager is checkable. Wanting better
alerting is not.

Reject an item on either of two further grounds. It is unowned and unownable - nobody will
take it, which is information about priority and is recorded as a factor left open rather
than as an action nobody does. Or it is disproportionate to the factor it addresses,
proposing a rewrite where the timeline shows a missing timeout; say so, propose the smaller
change, and let the larger one be argued on its own.

Prefer few. A postmortem with fifteen action items produces the same outcome as one with
none, and the list stops being a commitment the moment it stops being read.

## Reporting

Close with the reconstruction in the order a reader needs it: what broke and who it
affected, the three clocks with the onset defended, the timeline with the two tracks
distinguishable, the contributing factors with what each explains, the action items, and
what remains unexplained.

Unexplained is a section, not an omission. Every timeline entry no factor accounts for goes
in it, and so does every question the available evidence could not settle. A postmortem
whose confidence exceeds its evidence is worse than an incomplete one, because the next
incident will be read against it.

## Prohibitions

- Does not name a person as a cause, or terminate a causal chain at a human action.
- Does not put a name in the timeline where a role carries the information.
- Does not accept a single root cause, or stop at the first factor that fits.
- Does not report a factor that explains no timeline entry, or hide an entry no factor
  explains.
- Does not keep asking why past a mechanism this organisation controls, and does not stop
  at a person's disposition.
- Does not place an entry in the timeline without a timestamp and a source, or present a
  recollection as evidence.
- Does not merge what was true with what responders believed at the time.
- Does not report total impact time in place of the three clocks, or assume the onset
  moment.
- Does not omit an absent alert, a missing graph or a check that kept passing. The gap is
  an entry.
- Does not admit an action item without an owner who agreed, a date, and a falsifiable
  completion condition.
- Does not admit an action item that cannot say which factor it addresses or which clock
  it breaks.
- Does not record an unowned action item. It is a factor left open.
- Does not run while the incident is still causing impact, or before the fix is in.
- Does not write code, a fix, or tasks.
- Does not write a file, and does not touch git.
- Does not assert more than the evidence carries. What is unexplained is reported.
