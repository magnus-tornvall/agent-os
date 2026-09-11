---
name: mvc
description: Initiate a minimal viable change by grilling the user down a design tree until its shape is settled - what ships, what does not and why, and what each decision ruled out. Writes the settled shape to one file on request, so it survives the conversation. Use before a change is planned, when what it is has not yet been pinned down.
disable-model-invocation: true
---

# mvc

It grills. That is the whole method: a design tree walked by asking the user the question
whose answer prunes the most, then re-deriving the frontier. What survives is the trunk,
the ledger of what was cut, the reason for each, and the risks the user ruled on.

Minimal is the constraint, not the aspiration. Every item that ships must be load-bearing
on the outcome. Three rounds is the budget, so that "we'll decide later" costs something.

This skill touches no git. It writes one file, and only when asked - see [Persisting the
shape](#persisting-the-shape).

## The grill

### Round 0 - synthesize

Fill what the conversation and the repository already determine before asking anything. A
question whose answer is in the repo wastes a round.

A shape this conversation already settled is determined, not a candidate: it is transferred,
and its provenance is the user's own answer. Re-deriving it invites a second opinion on a
decision already made, and afterwards the two are indistinguishable. The frontier it leaves is
empty, and an empty frontier asks nothing - which is what a re-invocation that wants only the
file costs. A shape that closed once was read against the outcome then, so a re-invocation goes
straight to the report or the file.

List the candidate questions first, then dispatch one subagent to answer what it can. The
candidates drive the search: a fixed file list reads what does not bear on this change and
misses the one file that does.

Candidates span both axes: what the repo settles, and what only the user can decide. A list
drawn from the first alone comes back with nothing dark, which leaves round 1 nothing to ask.

They span what could go wrong too - a risk is a candidate like any other. The axes worth a
thought while listing them: architecture and the technical mechanism under it, security,
operations and maintenance, dependencies and integration. Requirements risk needs no prompt,
because dark is already what it looks like. The axes prompt the listing and appear nowhere
else - one that turns nothing up produces no candidate and no line, since a named axis
reporting nothing found is a ritual rather than a finding.

The explorer returns, per candidate, either the answer with `file:line` or **dark** - looked
for, not found. Absence is a finding, because it is what becomes a question. A candidate can
be both: the constraint the repo imposes is determined, the requirement it cannot know is
dark, and splitting them is worth more than either half. It stops when every candidate is
answered or dark, not when a file list is exhausted.

Worth a lookup before anything else: precedent for the thing being added, which kills a
branch rather than a leaf; the code the change touches and its callers; the repo's own
convention and decision docs, whatever they are named; git history for the area; the
dependency manifest; the existing test setup.

Invent nothing. A plausible guess is indistinguishable from a decision the user made, and
telling those two apart is the point - which is why a determination without provenance is
dark, not determined. General knowledge about a framework is not provenance, and a citation
that proves something adjacent is worse than none: it makes the guess look checked.

A third provenance is admissible, and what it buys is the question the grill did not need to
ask. An inference from material already settled - the outcome, an answer the user gave, a
determination with a citation - is reported as **provisional**, with the material it follows
from. Silence accepts it, a word corrects it, and either way it cost a line rather than a slot.
It is not a breach of the above: what that forbids is a guess indistinguishable from the user's
own decision, and a provisional entry is typed so that it never is. One does not serve as
provenance for another, though - an inference resting on an inference is a guess with a paper
trail.

The web is in scope for one thing: a verifiable external fact a candidate turns on - a
platform capability, an API shape, a version. Not approach comparison, not best practice:
those are stances with no author, and the user owns the stances here. URL is provenance. Two
searches per candidate, and the answer counts only from a primary source - the vendor's own
documentation, the package's own stated requirements, the specification text. Two searches
that do not reach one leave the candidate dark.

Report the map before round 1: **determined**, with provenance; **provisional**, with what it
follows from; **ruled out**; **dark**; and the **risks**. The user corrects it or says nothing,
and either way round 1 asks from a shared map. Correcting a map is volunteered, so it costs no
round.

The risks are the one part of the map the user rules on rather than corrects. One line each -
the risk, its provenance, and what it would open - with no stance and no body, because the
value is in the ruling, and a paragraph apiece turns the block into four questions asked before
round 1. Accepting a risk raises the ranking of every question hanging off it. Declining prunes
them, and the risk lands in the non-goals typed the way it was declined: a boundary when it
falls outside the change's shape, a deferral when it is real and parked. A decline is a ruling,
so it is recorded - an unrecorded one is re-raised by whatever implements the change, and by
then nobody remembers it was answered.

### Rounds 1 to 3 - ask, re-derive

Each round is one batch of **four questions**, asked together, answered together.
Fewer than two is not a round, it is a conversation - except a final single question, which
is a whole round when it is all the frontier holds.

A round is spent when the batch is asked. Not by the answers: a batch that comes back with
three of four answered still spent it, or nothing bounds a grill that keeps re-asking.

**Questions in one round must be independent**: no answer may change whether another in the
same batch is worth asking. The failure mode is batching four and having the first answer
delete the other three - so when in doubt, hold it back.

More than four candidates, rank by what an answer would prune and by the risk it bears on: an
accepted risk is what wins a slot for a question that would not have taken one on pruning
alone. The question that rules the most out takes the slot; one that closes a single leaf takes
one only when nothing bigger is open. A question whose answer the grill can predict is not
ranked at all - it belongs in the map as provisional, where it costs a line.

**A risk a stance creates mid-grill joins the map's risk block**, appended, and takes the same
ruling. One register. Two means the close has to merge them, and the merge is where a risk
loses its disposition: a reader of two lists cannot tell why a risk sits in one rather than the
other, or which ones the user answered.

**What the batch could not hold is listed, not discarded.** A candidate that would prune a
branch - kill other questions hanging off it - gets one line under the round in an **open,
not asked** list: the title, nothing else. No stance and no rules out, because the cost of a
fifth question is the stance and the body, not the title. The user promotes one to a real
question or closes it, and a listed candidate the user says nothing about stays listed. A
candidate that closes a single leaf is dropped silently - the branch-or-leaf test is what
keeps the list from becoming a fifth question under another name.

**Nothing leaves the grill still listed.** A candidate still on the list when the frontier
closes takes an exhaustion exit like any other survivor, and usually exit 2 - "not now, and
why" is what an unasked branch is. The list is never reported as its own section: an entry
carrying neither a boundary nor a deferral reason is an omission, and an unsettled item with
a reason attached reads to whatever implements the change as a blank it may fill rather than
one it must stop at.

**An unanswered question is not silent acceptance of its stance.** Ask why it was skipped,
once, in the same reply that reports the round: unclear means clarify and re-ask within the
round, since clarification never spends budget; premature means it stays open; don't-care
means the stance stands. Silence to that is a signal too - carry it and move on, and never
withhold the round's other answers waiting for it.

A re-asked question is asked verbatim. A reworded question is a different question, and the
silence was about this one.

**A question is withdrawn or it stands - it is never replaced.** Withdrawing names which of
three things happened: an answer in the same batch killed it, which is an independence
failure and is reported as one; a fact arrived and reframed it, which is the frontier
working; or it was worded badly. A `replaces Qn` label carries all three at once and reports
none of them, and the cause is the information.

Withdrawing is free - the slot went when the batch was asked, so there is nothing to refund.
What takes its place is a new question, numbered fresh, competing for a slot like any other
candidate; it is not the old one in a new body. The retired number is never reused, because
the ledger this skill produces needs questions to keep their identity.

### The question format

Plain text, one block per question, never a picker. A picker makes the most valuable reply
awkward - "hang on, you are asking the wrong thing" should be as easy to type as an answer,
and in a grill it often is the answer.

```
❓ **Q1** — **Per-environment policy**: Does the CSP value need to differ between staging
and production?

➡️ **Stance**: No — one string from an env var, no code difference. Staging and production
serve the same routes from the same bundle.
   **Rules out**: per-env code branches, and any policy registry.
```

**Stance, never recommendation.** The cheapest response to a recommendation is agreement;
the cheapest response to a stance is an argument, and the argument is the thing worth
having. The reasoning is always inline - a stance without it is an appeal to authority with
nothing to disagree with.

**Rules out** is what agreeing costs. It is the line that makes someone stop.

**One question, one decision.** If the stance needs an "and" to answer it, or if **Rules
out** covers only half of it, it is two questions and one of them waits. The ceiling counts
decisions, not blocks - a question carrying two is how four blocks come to hold eight, and
the reply it earns is "which of these are you asking", which costs a round to recover.

**No option lists.** Options plus a stance is a ballot with a box already marked. A
freeform counter is what surfaces the option neither party listed, which in a design tree
is where the pruning happens. Enumerate only when the answer set is genuinely closed, and
then the stance is a ranking rather than a position.

**Keep bodies to one short paragraph.** Four is what a person absorbs at this density; three
paragraphs each silently makes the real ceiling two.

**Clarification is off-budget and unlimited.** Nobody attacks a stance they have not
understood. Asked why one holds, expand: the evidence, what it assumes, what would make it
wrong. Never restate it louder. Asked what a question even means, answer plainly and drop
the stance until it lands. A question back is not a vague answer, and never gets pushed
back on.

### Pushing back

- **A settled decision reopened.** Ask what changed. Nothing changed, it stays settled.
- **An answer that widens the change.** Route it through widening below, or make it a
  non-goal. Never let it into what ships quietly.
- **A better option exists.** Say which and why, once - then it is the user's call, and a
  reaffirmed decision is closed. Re-arguing it is not grilling, it is stalling. "Once" caps
  what is volunteered, not what is asked for: pressed, explain as fully as it takes.
- **A vague answer.** "Probably", "some kind of", "we'll see" is not an answer. Ask the
  narrower question.

### Exhaustion

There is no round four. Finishing the third with questions still open is not a failure - it
is information. Each survivor takes one of three exits:

1. **The user answers it off-budget** - volunteered, not asked by a round. Costs nothing,
   because the ceiling bounds what this skill asks for, not what the user offers.
2. **It becomes a non-goal**, deferred with a reason, and stops blocking.
3. **Neither.** The change is too big to define in three rounds; report that and propose
   the split.

This skill does not raise its own ceiling. A budget that moves when it binds is not a
budget, and the split signal is the most valuable thing it produces. Lowering it is the
user's call; only raising is the rule being broken.

## Widening

Anything entering the shipping set after round 1 is a widening, and is stated as one: what
it is, where it came from, why the outcome is unreachable without it, and what it ruled
out. The reason clears a bar - not "it would be better with this", but "the outcome does
not happen without this".

**The grill proposes, the user decides.** It never admits an item on its own reasoning, and
never withholds one it spotted because the idea was not the user's. It states the widening
and argues it once; the call is the user's, and a rejected proposal is closed.

The same statement carries the pushback. An item that competes with a pattern already in the
repo, adds a dependency, or challenges the existing architecture says so where it enters.
That is cheaper than finding it once the set is closed, and it is the same sentence either
way.

## What ships, what does not

Sorting these is the judgement the grill exists to produce.

**Ships.** The test is deletion: remove the item and the outcome no longer holds. Anything
whose absence merely makes the result slower, uglier, or less pleasant is a non-goal. A
shipping list where every item survives deletion is not an MVC.

**Non-goals.** One list from the start. Every entry carries either a **boundary** - never
this change, and the line that separates them - or a **deferral reason** - not now, and
why. Which one it carries is the entry's type, and an entry carrying neither is not a
non-goal, it is an omission.

The two types are argued differently, which is why the type is written down rather than
inferred. A boundary prunes: it kills a branch and every question hanging off it, which is
the most frontier a single answer can clear. A deferral only parks - the item leaves what
ships, its subtree stays alive. The list exists to stop re-litigation, not to inventory
everything imaginable; if nobody would have asked for it, leave it out.

**Ruled out.** Every decision names what it eliminated. A decision that eliminates no
alternative was not a decision, it was a description. "We will write tests" rules nothing
out; "tests go in the existing suite, not a new harness" rules out a new harness.

## Reporting the shape

Close by naming the shape in the fields a specification is written in, so whatever consumes
it copies rather than translates.

One read of the closed set comes first: does any shipping item become redundant now that the
rest are settled? Two that each looked proportionate as they arrived can cover the same ground
once the set is closed, and only the closed set shows it. That is the one thing entry cannot
check - everything else about what ships was settled as it entered, under the deletion test or
the widening bar, and asking again is a second opinion on a decision already made.

A grill settles two kinds of thing and they go to different fields. What the outcome requires
is `outcome`, `requirements`, `non_goals`. How it is reached - every stance that named a file,
a symbol, a technology or a value - is `approach`, `constraints` and `touchpoints`:

- `approach` - the mechanism chosen.
- `constraints` - the limits the mechanism must respect.
- `touchpoints` - the files and symbols it lands on.

Reporting one of those as a requirement smuggles a mechanism into the goal, where the next
replan is free to renegotiate it.

Non-goals carry across with the type they were argued under - boundary or deferral - because
that is what decides whether reopening one is a question or a mistake.

A risk carries no field of its own. It lands as a `constraint`, as a typed non-goal, or as a
cost the shape accepts - and an accepted one names what accepting it costs, the way every
decision names what it ruled out. A risk that lands nowhere is dropped rather than listed: an
entry with no consequence reads as an observation, and what ships here is decisions.

What each decision ruled out belongs to no field: it is the prose that ships with the shape.
It is the most expensive thing the grill produced and the only record of the branches, so it
is not optional and it is not a summary.

Every part comes with where it came from. The user is auditing a shape they did not write,
and provenance is what makes that an audit rather than a skim.

## Persisting the shape

Reported is enough for a conversation that continues. One that ends takes the shape with it -
so on request, and only on request, the shape is written to one file.

The gate is the closed frontier, not the argument. Asked for the file while questions are still
open, name which and write nothing: a file that presents an unsettled shape as a settled one is
worse than no file, because its reader cannot tell the difference.

Path, first case that matches what the user gave. `.md` is what makes an argument a file, and
a path separator is what makes it a path - both read off the argument, so the same argument
always resolves the same way. The checks below are what consult the filesystem:

- ends in `.md`, with a separator - that filepath
- ends in `.md`, no separator - that filename in `<dir>`
- anything else - a directory: `mvc-<slug>.md` in it
- nothing - `mvc-<slug>.md` in `<dir>`

`<dir>` is `.scratch` in the repository root when it exists, else the system temp directory.
`<slug>` is two to four kebab-case words from the outcome. Report the absolute path of what was
written - a file whose location the reader has to go looking for is not a handoff.

Then two checks, in this order, before anything is written. Each one says so and stops - it
never falls through to another case, and stopping costs nothing, because the shape is still in
the conversation and a re-invocation asks nothing.

- The resolved directory must exist. A typed path that is not there is a typo, and creating it
  buries the mistake in a directory name - which is also why an argument that is neither a
  `.md` file nor an existing directory stops here rather than being guessed at.
- A file already at the resolved path is replaced only when it is itself a shape file -
  frontmatter carrying the fields below. Anything else is named, not written: destroying an
  unrelated document is the same failure as writing an unsettled shape, with someone else's
  content as the casualty.


The file is the report, in the same fields and the same prose: frontmatter carrying `outcome`,
`requirements`, `non_goals` with each entry's type on the entry, `approach`, `constraints` and
`touchpoints`, and a body carrying the ruled-out ledger, the cost of each accepted risk, the
argument behind each type, and where each part came from. Nothing else. A field the report does not have is one the grill did
not settle, and an unsettled item reaches the file as a boundary, as a deferral, or not at
all.

The file carries no approval, no round count and no frontier. Acting on it is the acceptance,
and a file that half-resumes a grill is how three rounds become six.

A later grill on the same outcome resolves to the same name and replaces its own file; a
different outcome resolves to a different one, so `<dir>` holds as many shapes as there were
grills. Nothing reads any of them back - a round 0 that took a shape file as determined context
would make the file state the grill maintains rather than a report it emitted, and the grill
lives in the context window.

## Prohibitions

- Does not settle the shape on the user's behalf.
- Does not ask more than four questions in a round, or two whose answers interact.
- Does not settle two decisions in one question. The ceiling counts decisions, not blocks.
- Does not reserve a batch slot for an unanswered question, or reword it when re-asking.
- Does not replace a question. It is withdrawn with its cause, and its number is retired.
- Does not discard a branch-pruning candidate the batch could not hold. It is listed.
- Does not report an open question as its own section, or carry one out of the grill
  untyped. It leaves as a boundary, a deferral, or the split signal.
- Does not present a stance as a recommendation, state one without its reasoning, or pair
  one with a list of options.
- Does not let anything into the shipping set after round 1 without a widening reason, and
  does not admit one on its own reasoning. It proposes; the user decides.
- Does not carry a risk the user has not ruled on, or drop a declined one without recording it.
- Does not carry a risk that changes nothing about the shape. It lands in a field or it goes.
- Does not name a risk axis that turned nothing up.
- Does not invent an answer to fill a gap. A gap is reported.
- Does not keep the pruned branches. What each decision ruled out is the record; the
  transcript is not.
- Does not write code, a plan, or tasks.
- Does not write a file unasked, or before the frontier closes.
- Does not put anything in the file the reported shape does not carry.
- Does not overwrite a file that is not a shape file. It names it instead.
- Does not create a directory it was not given. A path that is not there is a typo.
- Does not read a shape file back. The grill lives in the context window.
- Does not ask what the repository already answers.
- Does not report a determination without provenance, a provisional one without the material
  it follows from, or cite one provisional entry as provenance for another.
- Does not report a stance that names a file or a technology as a requirement.
- Does not search the web for approach comparison or best practice.
- No vague qualifiers in the outcome or in what ships.
