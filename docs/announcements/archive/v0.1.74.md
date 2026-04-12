# MassGen v0.1.74 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.74 — Checkpoint Improvements & Tool Call Fixes! 🚀 Major improvements to checkpoint MCP standalone server, fix for duplicate tool calls in ChatCompletions backend (including for MiniMax on OpenRouter), and evaluation criteria refinements.

## Install

```bash
pip install massgen==0.1.74
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.74
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.74 — Checkpoint Improvements & Tool Call Fixes! 🚀 Major improvements to checkpoint MCP standalone server. Fix for duplicate tool calls in ChatCompletions backend (including for MiniMax on OpenRouter). Evaluation criteria refinements.

**Key Improvements:**

🛡️ **Checkpoint MCP Improvements** — Significant enhancements to checkpoint coordination:
- Major additions to standalone checkpoint MCP server
- Refinements to subprocess execution and event relay
- Better isolation and workspace handling

🔧 **Duplicate Tool Call Fix** — Resolved duplicate tool call issues in ChatCompletions and Response API backends

**Plus:**
- 📋 **Evaluation criteria refinements** — Pre-collab criteria generation improvements

**Getting Started:**

```bash
pip install massgen==0.1.74
# Try checkpoint mode in Claude Code
claude mcp add massgen-checkpoint-mcp -- \
  uvx --from massgen massgen-checkpoint-mcp --config path/to/config.yaml
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.74

Feature highlights:

<!-- Paste feature-highlights.md content here -->
