# Change: Update Checkpoint Coordination for Objective Planning and Public MCP Access

## Why

MassGen already has checkpoint as a **delegation mode** (`task=...`): the main agent hands a problem to the full team, who solve it collaboratively and return deliverables. That mode is unchanged and remains fully supported.

This change adds a second mode: **objective-based safety checkpointing**. The trigger is not "I need help solving this" but "I am about to do something irreversible and need a plan I can trust." The scope is any outcome involving irreversible actions — deletions, deployments, external communication, financial operations, schema changes. The output is a structured plan that constrains exactly how the main agent executes the sequence.

The existing proposal also no longer matches current implementation reality: checkpoint execution uses a subprocess boundary (not in-process mode switching), and the "in-process" design decision documented earlier was not implemented.

The existing proposal also no longer matches current implementation reality in one key area: checkpoint execution already uses a subprocess/subcall boundary rather than the originally proposed in-process mode switch. We need a fresh change that codifies the new objective-based behavior, the isolation model, and the public packaging/distribution story.

## What Changes

- Add an objective-based calling mode dispatched by the presence of `objective=...` (existing `task=...` delegation mode is unchanged)
- Define compact input: `objective`, `action_goals`, `eval_criteria` — no `context_paths` (full workspace + execution trace provided automatically)
- Define structured output: `criteria_applied` + ordered `plan` with per-step `constraints`, `approved_action`, and recursive `recovery` tree
- Clarify subprocess execution model and correct the "in-process" design decision documented in earlier specs/docs
- Document what's automatically provided to checkpoint agents (full workspace, execution trace, main agent tool list)
- Document when the main agent should call objective mode (any outcome involving irreversible actions)

## What's Next

- Validate the change and align implementation/tests to the new compact-input, rich-output contract
- Follow this change with any backend-specific enforcement hardening needed for native-tool edge cases

## Impact

- Affected specs: `checkpoint-coordination`
- Affected code:
  - `massgen/mcp_tools/checkpoint/`
  - `massgen/mcp_tools/standalone/`
  - `massgen/mcp_tools/subrun_utils.py`
  - `massgen/tool/workflow_toolkits/checkpoint.py`
  - `massgen/orchestrator.py`
  - `pyproject.toml`
  - `docs/modules/checkpoint.md`
  - `massgen/tests/test_checkpoint_coordination.py`
  - `massgen/tests/test_standalone_mcp_servers.py`

## Relationship to Existing Work

This change supersedes the earlier design direction in `add-checkpoint-coordination` without deleting that historical proposal. The new change should be treated as the current source of truth for objective-based checkpointing and public MCP packaging.
