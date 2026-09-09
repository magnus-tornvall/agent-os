---
name: deprecate
description: Decide how to retire a code path something still depends on - deleted now, or kept alive behind a migration window with an owner, an end and a signal. Use when the replacement already works and the only open question is what happens to the thing it replaced.
disable-model-invocation: true
---

# deprecate

One decision, and the whole skill is the rule that makes it: delete the old path now, or
keep it alive behind a window. Nothing here is about whether to replace the path - that is
already done, and this is invoked afterwards, when the replacement works and the old thing
is still standing.

Two failure modes bound the rule, and they pull in opposite directions. Deleting a path a
caller outside your reach still uses breaks someone who never heard the change was coming.
Leaving a dead path alive because nobody owns the delete is how a codebase accumulates
sanctioned corpses - each one still compiled, still tested, still read by whoever is next
in the file. The rule below is what keeps a decision from drifting to whichever of those
is cheaper today.

## The rule

**Close the caller set. If it is closed and empty, delete now. If it is closed and not
empty, migrate the callers in the same change and then delete. If it cannot be closed,
open a window.**

That is the whole decision, and every section below serves one of its three clauses. The
rule is stated as a rule rather than a checklist because the order does not matter and the
steps are not independent - what closing the set produces is which clause applies, and a
checklist run to the bottom produces a feeling of thoroughness instead.

A window is the expensive branch. It costs a migration period, a second path to maintain,
and a delete somebody has to come back for. Take it because the set will not close, never
because closing it is work.

## Closing the caller set

The set is closed when you can name every caller, not when a search returned nothing.
Those two are the same only in a language and a repository where every reference is a
symbol reference, and that is rarer than the search makes it look.

Static search finds the direct calls. Enumerate these separately, because it does not
find them:

- **Dependency injection.** A container registration binds an interface to this
  implementation somewhere the implementation's name does not appear.
- **Reflection.** A type loaded by name, a method invoked by string, a serializer that
  constructs by convention.
- **String-keyed lookups.** Registries, feature-flag keys, event names, handler maps
  keyed on a literal.
- **Template bindings.** A view, a component, an email template referencing a member the
  compiler never checks.
- **Config and route strings.** A route table, a scheduled job, a queue subscription, a
  deployment manifest, an environment variable naming a class or endpoint.
- **Callers in repositories you do not control.** A published package, a public endpoint,
  a shared library, another team's service. Search cannot see these at all.

Each class that applies gets its own search, in its own idiom: grep the container
registrations, grep the templates, grep the config, read the route table. A single
symbol search over the repository is not a caller enumeration and reporting it as one is
the mistake this section exists to stop.

The last class is the one that decides most cases. Anything published, exposed, or
consumed across a repository boundary makes the set open unless you own every consumer
and can see all of them - and outside a single repository, that is the common case, not
the exception.

## When the set will not close

An open set is not a licence to delete carefully. It is the window branch of the rule,
and it is taken as written: **the old path keeps working, unchanged, for the length of
the window.**

Unchanged is the constraint that matters. A path kept alive but quietly degraded - a
warning that breaks a parser, a shim that drops an edge case, a signature narrowed to
what the new path supports - is a break with a longer fuse, and the caller who finds it
finds it in production with no notice at all.

What the window adds to the old path is a deprecation marker in whatever form the
language and the repository already use, pointing at the replacement by name. A marker
that says a thing is deprecated without saying what to call instead leaves the reader
exactly where they started.

## What makes a window a promise

A deprecation window with nothing attached is a comment, and a comment does not expire.
Three things turn it into a promise, and all three are written down where the deprecation
is declared:

- **A named owner.** A person or a team, not the repository. The owner is who does the
  delete, and an unowned delete is one nobody is failing to do.
- **A stated end.** A date or a release, absolute and specific. "The next major" is an
  end; "eventually" and "once callers migrate" are not, because neither one is ever today.
- **A signal that says whether anyone is still calling it.** A log line, a metric, a
  counter, an analytics event - something that answers "is this still in use" without a
  search. Without it, the end date arrives and the only available answers are guessing
  and postponing.

A window missing any of the three is not a window. Say so, and either supply the missing
part or take the delete branch instead - those are the only two moves, because the third
is the failure mode this skill exists against.

## Before the delete lands

Whether it lands now or at the end of a window, the same things must be true:

- Every caller found is migrated, and the migration is in the change or already shipped.
- The signal, if there was a window, shows no traffic - and shows it over a period long
  enough to cover the slowest caller, which for a monthly job is more than a week.
- The end that was stated has arrived. A window shortened after it was published is a
  broken promise in the other direction.
- The path goes entirely: implementation, registration, config, tests, feature flag,
  documentation. A deleted implementation with its registration still in place is a
  deployment failure, not a cleanup.
- Nothing remains beside the replacement. No `v1` next to `v2`, no helper left orphaned,
  no compatibility shim kept "for now" - a shim that outlives the window is the original
  problem, renamed.

## Prohibitions

- Does not decide whether to build the replacement, or design it. It runs after.
- Does not migrate the callers. It names them and says what happens to the old path.
- Does not treat a symbol search as a closed caller set.
- Does not open a window without an owner, a stated end and a usage signal.
- Does not degrade a path it is keeping alive.
- Does not delete a path whose caller set is open.
- Does not leave a window running past its stated end without deciding again.
