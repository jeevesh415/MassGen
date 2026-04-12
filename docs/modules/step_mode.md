# Step Mode

Step mode (`massgen --step`) runs one agent for one step, then exits. A "step"
is a single action: either producing a `new_answer` or casting a `vote`. This
is the primitive that external orchestrators use to drive MassGen agents
incrementally.

Internally, each step invocation runs the full coordination engine
(see `docs/modules/coordination_workflow.md`) — checklist policy, enforcement
loop, timeout hooks, workspace snapshots — but with a single agent and a
single-action exit condition. Step mode is not a simplified code path; it's
the same orchestrator wired to exit after one workflow action.

## CLI Interface

```bash
massgen --step \
  --session-dir <path> \
  --config <yaml> \
  --eval-criteria <path> \
  --automation "query"
```

- `--step`: Run exactly one step, then exit
- `--session-dir`: Absolute path to shared session directory
- `--config`: YAML config with exactly ONE agent
- `--eval-criteria`: Optional JSON criteria file
- `--automation`: The query/task

Step mode runs take 5-30 minutes depending on the backend and task.

## Relationship to Normal Coordination

In a normal multi-agent run, the orchestrator manages N agents in parallel
within a single process. Agents stream concurrently, inject peer updates
mid-stream, and the orchestrator handles restart signaling internally.

Step mode externalizes this: one process per agent per step. The external
orchestrator (e.g., Claude Code's `/team-massgen-run` skill) replaces the
internal coordination loop — it launches step processes, collects results,
detects stale votes, and decides when to re-launch.

| Aspect | Normal run | Step mode |
|--------|-----------|-----------|
| Agent count per process | N (parallel) | 1 |
| Peer answer visibility | Mid-stream injection | Pre-loaded from session dir |
| Restart signaling | Internal `restart_pending` | External (re-launch process) |
| Coordination state | In-memory | Session dir (file-based) |
| Workflow actions per run | Many | Exactly 1 |

See `docs/modules/coordination_workflow.md` for the full internal coordination
lifecycle that runs within each step.

## What Happens Inside a Step

Within a single step invocation, the orchestrator runs the full per-agent
round engine:

1. **Pre-coordination**: workspace setup, tool wiring, system message building
2. **Session dir loading**: prior answers from the session dir are loaded as
   "virtual agents" into the coordination tracker, anonymized with labels
   like `agent1.1`, `agent2.1` (see Anonymization below)
3. **Agent execution**: the real agent runs with full tool access, sees peer
   context, and works through the enforcement/retry loop
4. **Workflow action**: agent calls `new_answer` (iterate) or `vote` (terminal)
5. **Step exit**: orchestrator sets `_step_complete = True` and exits the
   coordination loop. The agent does NOT continue to further rounds.

All internal machinery — checklist gating, timeout hooks, enforcement checks,
workspace snapshots — applies within this single step.

## External State Machine

The external orchestrator manages state across step invocations.

### Per-Agent States

Each agent cycles through these states across steps:

```
no_action → answered → voted
                ↑         │
                └─────────┘  (stale vote → re-launch → answer or vote again)
```

### Session Lifecycle (3 agents)

```
ROUND 1: Initial Answers
  All agents launch in parallel, no prior context
  agent_a: no_action → answered (step 001/answer.json)
  agent_b: no_action → answered (step 001/answer.json)
  agent_c: no_action → answered (step 001/answer.json)
  → No votes yet → no consensus

ROUND 2: Evaluation
  Each agent sees all round 1 answers (including its own, anonymized)
  agent_a: → voted for agent_b  (step 002/vote.json)
  agent_b: → voted for agent_b  (step 002/vote.json)
  agent_c: → answered again     (step 002/answer.json)  ← NEW ANSWER
  → agent_a, agent_b votes are STALE (haven't seen agent_c step 2)
  → Re-launch stale voters

ROUND 3: Re-evaluation
  Stale voters + new answerers re-launch
  agent_a: → voted for agent_c  (step 003/vote.json, fresh)
  agent_b: → voted for agent_c  (step 003/vote.json, fresh)
  agent_c: → voted for agent_c  (step 003/vote.json, fresh)
  → Majority (3/3) for agent_c → CONSENSUS
```

### Consensus

Consensus requires:
1. ALL agents have completed their current step
2. ALL votes are non-stale (seen_steps covers latest answers)
3. A single target has majority votes (> N/2)

### Answer-Driven Restart

When any agent submits a `new_answer`, all existing votes become potentially
stale. A vote is stale if:

```
for any agent_id in session:
  vote.seen_steps[agent_id] < latest_answer_step(agent_id)
```

Stale voters must re-launch to see the new answer before their vote counts.
This mirrors MassGen's production `restart_pending` logic — in a normal run,
the orchestrator signals `restart_pending` to agents who haven't seen the
latest peer answer. In step mode, the external orchestrator achieves the same
effect by re-launching the step process.

## Anonymization

Step mode uses the same anonymization as normal coordination:

- The external orchestrator assigns anonymous IDs: `agent_a`, `agent_b`, etc.
- MassGen's coordination tracker further remaps these to anonymous labels:
  `agent1.1` (agent 1, answer revision 1), `agent2.1`, etc.
- The running agent never sees real backend names (GPT, Gemini, etc.)
- The running agent sees its own prior work under the same anonymous label
  scheme — it cannot distinguish its own prior answer from a peer's

This double anonymization prevents model-name bias and self-preferencing.

## Session Directory

```
session_dir/
  agents/
    agent_a/
      001/
        answer.json           # Round 1 answer
        workspace/            # Copied from agent's workspace
      002/
        vote.json             # Round 2 vote
      last_action.json        # Per-agent action (parallel-safe)
    agent_b/
      001/
        answer.json
        workspace/
      last_action.json
  eval_criteria.json          # Shared evaluation criteria
```

### Key Properties

- **Agents at independent step counts**: Agent A might be on step 5 while
  Agent B is on step 2. The external orchestrator decides when to launch each.
- **Append-only**: Each step creates a new numbered directory. No overwrites.
- **Per-agent isolation**: Each agent writes only to its own `agents/<id>/`
  directory. Parallel writes are safe.

### `last_action.json`

Written per-agent at `agents/<id>/last_action.json`. Each agent has its own
file, so parallel writes never collide. There is no global `last_action.json`.

Fields:
```json
{
  "agent_id": "agent_a",
  "action": "new_answer",
  "answer_text": "The full answer...",
  "vote_target": null,
  "vote_reason": null,
  "timestamp": "2026-03-20T22:32:03Z",
  "step_number": 1,
  "duration_seconds": 45.2,
  "cost": {},
  "workspace_path": "/path/to/session/agents/agent_a/001/workspace"
}
```

### Workspace Persistence

When an agent submits a `new_answer`, step mode:
1. Copies the agent's workspace to `session_dir/agents/<id>/<step>/workspace/`
2. Replaces stale temp workspace paths in the answer text with the session
   dir workspace path
3. Records `workspace_path` in `last_action.json`

This ensures deliverable files (HTML, code, etc.) persist in the session dir
after the agent's temporary workspace is cleaned up.

### answer.json

```json
{
  "agent_id": "agent_a",
  "answer": "The full answer text...",
  "timestamp": "2026-03-20T22:32:03Z"
}
```

Workspace paths in the `answer` text point to the session dir copy
(auto-replaced on save).

### vote.json

```json
{
  "voter": "agent_a",
  "target": "agent_b",
  "reason": "Agent B's approach is more thorough...",
  "seen_steps": {"agent_a": 2, "agent_b": 2, "agent_c": 1}
}
```

`seen_steps` records the latest step of each agent the voter had seen.
Used for stale vote detection.

## Answer Visibility

In step mode, the running agent sees ALL prior answers from the session dir,
including its own prior answer. This is by design — the agent evaluates all
work from scratch, anonymized. The orchestrator:

1. Loads all session dir answers via `load_session_dir_inputs()`
2. Pre-loads them into the coordination tracker for anonymization
3. Includes them in `_get_current_answers_snapshot()` for context injection
4. When the agent submits a new answer, it takes precedence over the prior one

First-answer diversity protection code runs but is effectively a no-op in step
mode: there's only one real agent and all virtual agent context is pre-loaded
(not injected mid-stream), so there's no injection to defer. The protection
matters in normal multi-agent runs where mid-stream peer updates could cause
premature convergence (see `coordination_workflow.md`).

## Implementation

### Key Files

| File | Purpose |
|------|---------|
| `massgen/step_mode.py` | Save/load session dir, stale vote detection |
| `massgen/orchestrator.py` | Virtual agent loading, answer visibility, step completion |
| `massgen/cli.py` | CLI flag handling, workspace_source forwarding |
| `massgen/tests/test_step_mode.py` | Unit tests (state machine, workspace, visibility) |

### Data Flow

```
1. CLI parses --step --session-dir → StepModeConfig
2. Orchestrator loads session dir → virtual agents + coordination tracker
3. Agent runs full internal round engine (enforcement, checklist, tools)
4. Agent calls new_answer or vote → orchestrator captures _step_action_data
5. CLI calls save_step_mode_output:
   a. Copies workspace to session dir
   b. Replaces stale paths in answer text
   c. Writes answer.json or vote.json
   d. Writes per-agent last_action.json
6. CLI exits with code 0 (success) or 2 (no action)
```

## Related Docs

- `docs/modules/coordination_workflow.md` — full internal coordination lifecycle
- `docs/modules/architecture.md` — core system architecture
- `docs/modules/injection.md` — hook and injection internals
