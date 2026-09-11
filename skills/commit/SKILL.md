---
name: commit
description: Use when committing changes, writing commit messages, or when user invokes /commit. Triggers - git commit, /commit, commit message, staged changes ready to commit
---

# Commit Skill

Detect state, stage by hand into logical units, write well-formed conventional
commits, push per branch type.

**Supplements the built-in commit behavior.** Safety defaults stay — no
destructive ops, no hook skipping. This skill owns staging strategy, message
format, and push behavior.

## 1. Pre-flight

```bash
git status -sb                                      # branch, upstream, staged, unstaged, untracked, conflicts
test -d "$(git rev-parse --git-path rebase-merge)" ||
  test -d "$(git rev-parse --git-path rebase-apply)"   # rebase in progress?
```

Stop and report if:

| State | Action |
|-------|--------|
| Clean working tree | "Nothing to commit" — stop |
| Rebase in progress | Report; suggest `git rebase --continue`/`--abort` — stop |
| Unmerged paths (`UU`, `AA`, `DU`, …) | List conflicting files — stop |

On the default branch (`main`/`master`/`develop`), ask before committing —
default is to commit on the current branch; offer branching out as the
alternative. Proceed to branch only if the user picks it.

**Untracked files are a decision, never a default.** Each one is committed,
gitignored, or left alone — and gitignoring is its own concern, so it is its own
commit. Anything that reads as a credential (`.env`, `*.pem`, `*.key`,
`credentials*`), a build artifact, or scratch output is reported, not staged.

**Commit only what you can explain.** The tree may hold work that is not yours.
Changes you cannot account for are listed for the user and left unstaged, never
swept in alongside your own.

## 2. Analyze

Index before content. This skill runs on multi-file changes, and an unfiltered
diff spends the context the grouping needs:

```bash
git diff --stat; git diff --staged --stat     # what moved, and how much
git log --oneline -5                          # message style + context
git diff -- <path>                            # only the files whose content decides the grouping
```

Understand how the changes relate before grouping them.

## 3. Stage into logical units

- Stage files **by explicit path** — never `git add -A`, `git add .`, or `-p`.
- Tightly coupled changes → one commit (impl + its tests + directly related config).
- Unrelated concerns → separate commits. Never bundle unrelated changes.
- One file carrying two concerns is not split by hunk — hunks picked by an agent
  are unverifiable. Commit the file once with an honest message, or hand the
  split to the user.

Before each commit, verify what is staged is what you meant:

```bash
git diff --staged --name-only                 # matches the unit you intended?
git diff --staged | grep -E '^\+.*(<<<<<<<|>>>>>>>|console\.log|debugger|\.only\()'
```

Conflict markers, debug logging and focused tests do not go in.

## 4. Message format

    <type>(<scope>): <description>

    - <why, and what it ruled out>
    - <why, and what it ruled out>

    BREAKING CHANGE: <what breaks, and the migration>

- **Type:** `feat` `fix` `refactor` `test` `docs` `chore` `perf` `ci`.
- **Scope:** the subsystem/module touched (`api`, `auth`, `db`, `ui`, …). Match
  the scopes already used in this repo's `git log`; omit only when the change
  genuinely spans everything.
- **Description:** imperative mood, lowercase, no trailing period, ≤72 chars.
- **Body:** blank line, then `- ` bullets, wrapped at 72 columns. Required for
  anything non-trivial (features, refactors, multi-file); skip for simple fixes,
  renames, config tweaks.
- **Breaking change:** `!` after type/scope marks it — `feat(api)!: …` — and a
  `BREAKING CHANGE:` footer says what breaks and how to migrate. The `!` alone
  announces a break and withholds the part that matters.
- **Never** add `Co-Authored-By` or any AI attribution.

**The subject says what changed; the body says why, and what the change ruled
out.** The diff already lists the files, so a bullet that names them — or that
restates the subject — is a wasted line. Banned outright: vague subject verbs
(`update`, `change`, `modify`, `improve`) and lazy bodies (`various
improvements`, `misc fixes`, `minor changes`).

Deliver the message on **stdin**, never through `-m`:

```bash
git commit -F - <<'EOF'
refactor(search): rule out a subclass per product filter

- Compose filters as specifications, so a new filter is a value rather than a
  class: the subclass tree was doubling on every second filter added
- Delete ProductFilterBase and its six subclasses; nothing else implemented it
EOF
```

`-m "$(cat <<'EOF' … EOF)"` is unusable: bash 3.2 — still `/bin/bash` on macOS —
scans for the `)` closing a command substitution inside double quotes without
knowing the heredoc body is literal, so one `"` in the message flips its quote
state and the command dies with ``unexpected EOF while looking for matching `)'``.
The quoted delimiter plus stdin keeps `"`, `'`, `` ` `` and `$(…)` literal on
every bash.

Reach for a file only when the same message has to be committed twice — write it
to the scratchpad and `git commit -F <path>`.

Good: `feat(auth): add token-refresh endpoint` ·
`fix(api): correct null check in order validation`
Bad: `add endpoint` (no type) · `fix: Fixed the bug.` (past tense, capitalized,
period).

### When a hook rejects the commit

No commit was created — what changed is the tree. Most hooks rewrite files
(`prettier`, `gofmt`, `lint --fix`): re-stage what they touched, by path, and
retry the same commit with the same message. A hook that reports rather than
rewrites: fix the cause, re-stage, retry. `--no-verify` is never the answer.

### Amending

Never on your own initiative. Amend only when the user asks for it and the
commit is unpushed; otherwise a correction is a new commit.

## 5. Push

Push the current branch, `-u` when it has no upstream. **Never** `main`,
`master`, `develop` or `release/*` unless told to — `~/.claude/hooks/push-guard.sh`
blocks those, so it is not a judgement call.

A push rejected as non-fast-forward means the upstream moved: stop and report.
Never `--force`, and never `--force-with-lease`, unless the user asks for it by
name.

## 6. Summary

After all commits are created, draw a table (hashes and subjects verbatim from
`git log --oneline`):

| Commit Hash | Subject | Branch |
|-------------|---------|--------|
| abc1234 | feat(api): add favorites endpoint | feat/favorites-api |
| def5678 | fix(api): correct null reference in validation | fix/validation-api |
| ghi9012 | refactor(search): use specification pattern | feat/search-refactor |
