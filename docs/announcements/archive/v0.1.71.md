# MassGen v0.1.71 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.71 — Trace Memory & Evaluation Polish! 🚀 Trace analyzer subagents now launch in the background after each round to write insights from the previous round's execution trace into memory. Plus: improved evaluation criteria generation, system prompt tuning, and stability fixes.

## Install

```bash
pip install massgen==0.1.71
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.71
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.71 — Trace Memory & Evaluation Polish! 🚀 Trace analyzer subagents now launch in the background after each round to write insights from the previous round's execution trace into memory. Plus: improved evaluation criteria generation, system prompt tuning, and stability fixes.

**Key Improvements:**

🔍 **Trace Analyzer Subagents** — Background intelligence from execution traces:
- Automatically launches after each round to analyze the previous round's execution trace
- Writes insights into memory for next-round continuity
- Fixes for trace memory handling and analyzer launch issues

📋 **Better Evaluation Criteria** — Improved criteria generation for higher-quality, more opinionated output

🧠 **System Prompt Tuning** — Adjusted system prompts for better agent performance across coordination rounds

**Plus:**
- 🔧 **Fix final injection** — Corrected injection behavior at the final stage
- 🔧 **Fix eval criteria GPT pre-collab** — Resolved evaluation criteria issues with GPT models during pre-collaboration phase
- 🔧 **Auto round fix for memory** — Fixed automatic round handling for memory

**Getting Started:**

```bash
pip install massgen==0.1.71
uv run massgen --config @examples/features/trace_analyzer_background.yaml "Create an svg of an AI agent coding."
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.71

Feature highlights:

<!-- Paste feature-highlights.md content here -->
