# MassGen v0.1.66 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.66 — Step Mode! 🚀 New `--step` CLI mode lets external orchestrators run one agent for one step then exit — the building block for plugins like massgen-refinery (https://github.com/massgen/massgen-refinery), which now supports step mode. Plus: Codex Windows fixes with UTF-8 encoding and console text sanitization.

## Install

```bash
pip install massgen==0.1.66
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.66
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.66 — Step Mode! 🚀 New `--step` CLI mode lets external orchestrators run one agent for one step then exit — the building block for plugins like massgen-refinery (https://github.com/massgen/massgen-refinery), which now supports step mode. Plus: Codex Windows fixes with UTF-8 encoding and console text sanitization.

**Key Improvement:**

🔄 **Step Mode** - Building block for external orchestrators:
- New `--step` CLI flag runs a single agent for one iteration, then exits
- Loads prior answers/workspaces from a session directory — source-agnostic (MassGen, Claude Code, shell scripts)
- Writes action + updated state back to session directory for the next step
- Powers the massgen-refinery Claude Code plugin: https://github.com/massgen/massgen-refinery

**Plus:**
- 🪟 **Codex Windows fixes** — UTF-8 encoding for file writes and console text sanitization for safe TUI rendering
- 🧹 **Console safety** — Text sanitization utility for logger and TUI event pipeline

**Getting Started:**

```bash
pip install massgen==0.1.66
# Run one step of a configured agent
uv run massgen --step --config your_config.yaml --session-dir ./my_session "Your task"
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.66

Feature highlights:

<!-- Paste feature-highlights.md content here -->
