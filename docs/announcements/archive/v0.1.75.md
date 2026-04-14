# MassGen v0.1.75 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.75 — Codex Hooks & Checkpoint WebUI! 🚀 Hybrid hook system for Codex backend combining native and MCP capabilities. Checkpoint workflows now auto-launch the WebUI for visual monitoring. Standalone checkpoint MCP server documentation and safety policy integration.

## Install

```bash
pip install massgen==0.1.75
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.75
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.75 — Codex Hooks & Checkpoint WebUI! 🚀 Hybrid hook system for Codex backend combining native and MCP capabilities. Checkpoint workflows now auto-launch the WebUI for visual monitoring. Standalone checkpoint MCP server documentation and safety policy integration.

**Key Improvements:**

🪝 **Codex Native Hooks** — Hybrid hook system for Codex backend:
- Combines native hooks and MCP capabilities
- Enables richer integration between Codex and MassGen's coordination

🛡️ **Checkpoint WebUI Auto-Launch** — Visual monitoring for checkpoint workflows:
- Checkpoint runs now auto-launch the WebUI with configurable host/port
- User/system prompt and eval criteria pass-through to checkpoint agents
- Improved checkpoint planning with precondition validation and recovery trees

📖 **Standalone MCP Server Documentation** — Guide for `massgen-checkpoint-mcp`:
- Setup guide with examples and troubleshooting
- Safety policy integration documentation

**Plus:**
- 🔒 **Safety policy update** — Updated safety policy for checkpoint based on Claude Code safe mode
- 🐛 **WebUI automation fix** — Fixed erroneous setup redirect during automation mode

**Getting Started:**

```bash
pip install massgen==0.1.75
uv run massgen --config @examples/features/fast_iteration.yaml "Create an svg of an AI agent coding."
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.75

Feature highlights:

<!-- Paste feature-highlights.md content here -->
