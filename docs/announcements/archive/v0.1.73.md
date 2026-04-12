# MassGen v0.1.73 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.73 — Eval Criteria Evolver & Checkpoint Objectives! 🚀 New eval criteria evolver subagent that improves criteria across rounds. Initial draft of checkpoint objective mode for safety planning of irreversible actions. Improved visibility of evaluation criteria.

## Install

```bash
pip install massgen==0.1.73
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.73
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.73 — Eval Criteria Evolver & Checkpoint Objectives! 🚀 A new eval criteria evolver subagent improves criteria across rounds. Initial draft of checkpoint objective mode adds safety planning for irreversible actions. Plus: improved visibility of evaluation criteria.

**Key Improvements:**

🧬 **Eval Criteria Evolver Subagent** — Criteria that improve themselves:
- New subagent type that evolves evaluation criteria across rounds
- Sharper, more opinionated criteria as the run progresses

🛡️ **Checkpoint Objective Mode** — Safety planning for irreversible actions:
- Initial draft of checkpoint MCP with `objective` mode
- Plan irreversible operations (deletions, deployments, financial actions) safely before executing
- Returns structured plan with per-step constraints and recovery trees

👁️ **Improved Eval Criteria Visibility** — See what criteria agents are working against, more clearly

**Getting Started:**

```bash
pip install massgen==0.1.73
uv run massgen --config @examples/features/trace_analyzer_background.yaml "Create an svg of an AI agent coding."
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.73

Feature highlights:

<!-- Paste feature-highlights.md content here -->
