<!--
Thank you for contributing to Roo Code!

Before submitting your PR, please ensure:
- It's linked to an approved GitHub Issue.
- You've reviewed our Contributing Guidelines.
-->

### Related GitHub Issue

Closes: #7966

### Roo Code Task Context (Optional)

_No Roo Code task context for this PR_

### Description

This PR implements a Redis-backed global FIFO queue for Evals runs. It ensures that only one run executes at a time, queues additional runs automatically, auto-advances when the active run completes, and minimally updates the Web UI to display status and allow canceling queued runs.

Key design points:

- Redis keys
    - evals:run-queue (LIST) — FIFO of run IDs
    - evals:active-run (STRING with TTL) — currently executing run
    - evals:dispatcher:lock (STRING with TTL) — serializes dispatchers to avoid races
- Separation of concerns
    - Web enqueue/dispatch helpers live in apps/web-evals/src/actions/queue.ts
    - CLI completion dispatch lives in packages/evals/src/cli/queue.ts
    - apps/web-evals/src/actions/runs.ts enqueues instead of spawning directly, then triggers dispatch
- Race safety
    - After dequeue, if setting evals:active-run fails (rare race), the popped id is LPUSH’d back to preserve FIFO ordering
- Auto-advance
    - On completion, the CLI clears the active marker and dispatches the next run

Files changed:

- Added queue actions and dispatcher (web): apps/web-evals/src/actions/queue.ts
- Enqueue on createRun + trigger dispatch: apps/web-evals/src/actions/runs.ts
- UI Status column + queued position + cancel:
    - apps/web-evals/src/components/home/runs.tsx
    - apps/web-evals/src/components/home/run.tsx
- Auto-advance on completion (CLI) + queue helpers (CLI):
    - packages/evals/src/cli/runEvals.ts
    - packages/evals/src/cli/queue.ts

This PR supersedes and replaces the approach in PR #7971 by ensuring re-queue-on-failure after dequeue and providing a clearer separation of concerns between web and CLI sides.

### Test Procedure

- Unit tests (extension workspace):
    - cd src && npx vitest run
    - Result: 291 files, 3,804 tests passed; 48 skipped (baseline unchanged)
- Manual verification (recommended):
    1. Launch web evals UI, create multiple runs quickly
    2. Observe:
        - First run shows “Running”
        - Subsequent runs show “Queued (#N)” with correct positions
        - Only one run executes at any time
    3. Cancel a queued run via the row menu — it should be removed from the queue and deleted
    4. Wait for a run to complete — next run should auto-dispatch

### Pre-Submission Checklist

- [x] **Issue Linked**: Closes #7966
- [x] **Scope**: Changes are focused on global FIFO queue feature
- [x] **Self-Review**: Code reviewed and race conditions considered
- [x] **Testing**: Existing tests pass; manual verification steps included
- [x] **Documentation Impact**: No external docs required for minimal UI changes
- [x] **Contribution Guidelines**: Followed project conventions

### Screenshots / Videos

_No UI screenshots included — changes are minimal (Status column and Cancel action)._

### Documentation Updates

- [x] No documentation updates are required.

### Additional Notes

- TTL choices:
    - Dispatcher lock TTL set to 30s for stability on slower hosts
    - Active-run TTL is generous to reduce accidental expiry during long runs
- Future improvement:
    - Refresh evals:active-run TTL alongside heartbeat ticks to reduce worst-case stall after crashes

### Get in Touch

@hannesrudolph
