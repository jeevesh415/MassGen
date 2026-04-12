# MassGen v0.1.68 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.68 — Checkpoint Mode! 🚀 New checkpoint coordination mode lets a main agent plan solo then delegate execution to the full multi-agent team via the `checkpoint()` tool. Plus: LLM API circuit breaker (currently Claude backend only), WebUI checkpoint support, and LiteLLM supply chain fix (if you installed MassGen on March 24, 2026, between 10:39 UTC and 16:00 UTC, please see https://docs.litellm.ai/blog/security-update-march-2026 to check if affected).

## Install

```bash
pip install massgen==0.1.68
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.68
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.68 — Checkpoint Mode! 🚀 New checkpoint coordination mode lets a main agent plan solo then delegate execution to the full multi-agent team via the `checkpoint()` tool. Plus: LLM API circuit breaker (currently Claude backend only), WebUI checkpoint support, and LiteLLM supply chain fix (if you installed MassGen on March 24, 2026, between 10:39 UTC and 16:00 UTC, please see https://docs.litellm.ai/blog/security-update-march-2026 to check if affected).

**Key Improvement:**

🔀 **Checkpoint Mode** - Delegator pattern for multi-agent coordination:
- Main agent plans and gathers context solo, then calls `checkpoint()` to delegate to the team
- Fresh agent instances with clean backends execute the task collaboratively
- After team consensus, main agent resumes with results and deliverable files
- WebUI support for checkpoint mode display

**Plus:**
- ⚡ **LLM API circuit breaker** — automatic 429 rate limit handling with circuit breaker pattern (currently Claude backend only)
- 🔒 **LiteLLM supply chain fix** — pinned litellm<=1.82.6 and committed uv.lock to prevent dependency attacks

**Getting Started:**

```bash
pip install massgen==0.1.68
# Try checkpoint mode -- click 'COORD' in the mode bar above the input then the checkpoint box
uv run massgen --web
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.68

Feature highlights:

<!-- Paste feature-highlights.md content here -->
