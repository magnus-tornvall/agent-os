---
outcome: >-
  A POC in this repo that evaluates the sandcastle stack by driving one GitHub issue to a
  review-ready PR in a single unattended run — claim, implement, open PR, self-review as PR
  comments, read them back, fix, ping — emitting a per-run record of iterations, commits,
  timings and comment ids, so the stack is judged from evidence rather than from the
  finished PR.

requirements:
  - One invocation performs the whole sequence and exits. Nothing resumes it.
  - >-
    The sequence is: claim the issue, implement, open a PR, review that PR and post findings
    as PR comments, read those comments back from GitHub, apply fixes, signal the user.
  - Every tracker and PR state change is performed by the driver. No agent performs one.
  - The implementing agent receives the issue content from the driver rather than fetching it.
  - The reviewing agent has no memory of writing the code under review.
  - No PR is opened when the implement stage produced no commits.
  - >-
    The run emits, per stage: wall time, iterations consumed, commit shas, and the ids of the
    comments it wrote.

approach:
  driver: >-
    One TypeScript file executed directly by node — linear stage calls, no stage machine, no
    persisted task state.
  sandcastle: >-
    createWorktree({ branchStrategy: { type: "branch", branch } }), then three sequential
    wt.run() calls — implement, review, fix — each with claudeCode(...) and noSandbox(), using
    promptFile + promptArgs, maxIterations and completionSignal.
  github: >-
    The gh CLI, shelled out from the driver — issue view, issue assign, pr create (opened
    ready), pr comment per finding, comment read-back before the fix stage, and the post-fix
    push.
  prompts: >-
    Three static markdown files, one per stage. Their directory is a leaf chosen by the grill,
    not settled by the user: workflows/prompts/.
  gate: result.commits.length from sandcastle. Nothing else.
  ping: osascript -e 'display notification …'
  run_record: JSON lines under .scratch/, plus each run's logFilePath.

constraints:
  - >-
    promptFile resolves against process.cwd(), not the worktree's cwd, so prompt paths are
    relative to where the driver is invoked.
  - >-
    resumeSession is incompatible with maxIterations > 1, so each stage is a fresh agent by
    construction and every prompt must stand alone.
  - >-
    sandbox is a required run() option, and noSandbox() does not pass
    --dangerously-skip-permissions. An unattended run needs a permissions grant; the current
    allowlist is Bash(echo:*). A .claude/settings.json committed to this repo travels into the
    worktree, which keeps the grant repo-local.
  - >-
    CreateWorktreeOptions accepts only branchStrategy, cwd, copyToWorktree, hooks, timeouts.
  - >-
    push-guard.sh blocks main/develop/master/release/*; agent branches push freely.
  - "Exactly one new dependency: @ai-hero/sandcastle (plus @clack/prompts transitively)."
  - node v24.18.0 runs .ts directly. No build, no tsconfig, no tsx.
  - >-
    gh is on the host and the agent is unfenced, so nothing prevents an agent touching GitHub;
    only the prompts not asking it to.
  - The repo is public.

touchpoints:
  - path: workflows/sandcastle-poc.ts
    state: exists, untracked, self-described "Sketch, not tested." — rewritten, not extended
  - path: package.json
    state: does not exist; created for the one dependency
  - path: workflows/prompts/ (three stage prompts)
    state: do not exist
  - path: .scratch/
    state: does not exist; the run record's home
  - path: .gitignore
    state: >-
      currently one line (node_modules/); .scratch/ needs adding or the record lands in a
      public repo
  - path: .claude/settings.json
    state: does not exist; the repo-local permissions grant, if that route is taken

non_goals:
  - item: Write fencing — constraining where the implementing agent may write
    type: boundary
    reason: >-
      The PR diff is the check. A driver that polices paths polices the wrong layer, and the
      line is that the driver never restricts the agent's write surface.
  - item: ADO as tracker and PR host
    type: deferral
    reason: >-
      Its risk was retired by hand — a PR read and a comment written through the installed MCP
      — so what is unproven is the stage shape, not the ADO plumbing. Swapping the tracker
      back is small once the shape is proven.
  - item: Item validation as a stage
    type: deferral
    reason: See the stack work first.
  - item: Frontmatter and path checks in the gate
    type: deferral
    reason: Hardening. The gate for v1 is "commits exist".
  - item: A reviewer rubric beyond a static prompt
    type: deferral
    reason: >-
      Tune it after the first run. The seam is a prompt file, later a project CLAUDE.md, and
      neither needs a driver change.
  - item: Failure handling on gate failure or zero commits
    type: deferral
    reason: Downstream hardening.
  - item: Reverting a claim after a mid-run crash
    type: deferral
    reason: Downstream hardening.
  - item: Resumability across processes
    type: deferral
    reason: >-
      The state file is cheap; the trigger, the cross-process worktree and the lost agent
      context are not. A one-shot run exercises none of the three, so building them would ship
      untested paths and teach nothing about them.
---

# POC: sandcastle workflow

## What each decision ruled out

**One-shot lifetime** killed the `Stage` union, `.sandcastle/tasks/*.json`, `loadTask`/`saveTask`,
`handledThreadIds`, any poller or launchd unit, and the sketch's asserted cross-process worktree
survival (`workflows/sandcastle-poc.ts:261-262`), which no sandcastle documentation supports.

**Driver lives in this repo** killed `sandcastle init` scaffolding inside a target repo, prompts
versioned beside the code they edit, and per-target copies of the driver.

**Driver owns tracker calls** killed prompt-driven claiming and PR creation, and the "agent forgot
to update the item" failure class. The original argument for feeding the issue in — the ADO MCP
server being scoped to this repo's path key — became moot when ADO left; the decision now rests on
the user's answer alone.

**`noSandbox()`** killed the init scaffold, the image lifecycle, `CLAUDE_CODE_OAUTH_TOKEN` in
`.sandcastle/.env`, and container-side private-registry credentials. It bought back the permissions
problem recorded in the constraints.

**Fresh reviewer** killed `resumeSession`/`fork`, passing the implement transcript forward, and
review-as-a-final-iteration-of-implement.

**GitHub for v1** killed `@modelcontextprotocol/sdk`, the `TOOL` name map (`:31-39`), `payload()`'s
content-block parsing (`:61-77`), `connectAdo()`, the need for a new ADO project, and agent-authored
work items on a customer's backlog.

**"Commits exist" as the gate** killed `npm run verify` (`:276`, `:308`), which exists in no repo
involved, and every prose-linting idea.

**The minimality pass** killed `copyToWorktree: ["node_modules"]` — nothing in the worktree needs
dependencies once the deliverable is markdown and the gate is computed outside it — and the
draft-then-ready PR pair, since a personal repo has no branch policies and no other collaborators to
shield, leaving the ping as the whole handoff. It kept the comment read-back precisely because the
read path is itself under evaluation. Both deletions were read back against the outcome together:
they do not interact, and the reduced set still reaches it.

**Superseded by the library, and moot for v1**: `throwOnDuplicateWorktree: false` (`:259`) no longer
exists in `@ai-hero/sandcastle@0.12.0`; PR `create` takes `workItems`, so the separate
`link_to_pull_request` call (`:129-137`) was never needed; and the work-item update parameter is
`id`, not `workItemId` (`:100`). All three wait unchanged if ADO returns.

## Why each non-goal carries the type it does

One boundary, and it is a boundary because the argument is about layering rather than timing: write
fencing is work the PR review already does, so no later phase inherits it. Everything else is a
deferral — each one leaves the shipping set with its subtree alive, and each was deferred to keep
the first run's evidence about sandcastle rather than about hardening built on top of it. ADO is the
deferral most likely to be reopened, which is why the three library corrections above are recorded
rather than discarded.

## Provenance

**From the user, in the grill**: one-shot lifetime; driver and prompts in this repo, framed as a POC
to evaluate the stack; the driver rather than an agent performing tracker calls, with indifference
about who reads the issue; item validation deferred; `noSandbox()`; a fresh review agent; a ping
rather than a reviewer-add as the handoff; the run record accepted as a widening; GitHub in place of
ADO for v1 with the tracker swap judged small; the gate reduced to a diff/commits check; a static
review prompt, on the observation that the agent runs in the repo and has its context; write fencing
rejected as over-engineering; failure handling and crash recovery deferred; and, at the minimality
pass, `copyToWorktree` and the draft/ready pair dropped with the comment read-back kept.

**From this repository and session**: the repo is four files with no `package.json`, `tsconfig`,
lockfile or `node_modules`, and `workflows/sandcastle-poc.ts` is untracked and self-described as an
untested sketch; the only remote is `github.com/magnus-tornvall/agent-tools.git`; `~/.claude/CLAUDE.md`
supplies the push-guard and one-dependency-ask rules; `~/.claude/settings.local.json` allows only
`Bash(echo:*)`; `gh` 2.97.0 is authenticated as `magnus-tornvall` with `repo`/`workflow`/`project`
scopes, issues enabled, default branch `main`, repository public; node v24.18.0 was verified in
this session to run a `.ts` file with type annotations, `as const` and top-level await with no
runner or build step; and the installed Azure DevOps MCP server was verified read/write by reading
PR 1629 and posting thread 6350 in `lao-web-frontend`, which is what retired the ADO risk.

**From the library, primary sources**: `@ai-hero/sandcastle@0.12.0` — `createWorktree`, `claudeCode`,
`noSandbox`, the `run()` options `agent`, `sandbox`, `promptFile`, `promptArgs`, `maxIterations`,
`completionSignal`, and `result.commits` all confirmed in `src/createWorktree.ts` and the README;
`sandbox` documented as required; `noSandbox` documented as not passing
`--dangerously-skip-permissions`; `promptFile` documented as resolving against `process.cwd()`;
`resumeSession` documented as incompatible with `maxIterations > 1`; no scheduler and no durable task
state anywhere in the package; and `throwOnDuplicateWorktree` recorded as removed in the CHANGELOG.

**Chosen by the grill, not settled by the user**: the prompt directory `workflows/prompts/`.
