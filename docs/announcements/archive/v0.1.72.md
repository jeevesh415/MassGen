# MassGen v0.1.72 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.72 — Grok Backend Update & Circuit Breaker Phase 2! 🚀 Updated Grok backend with latest improvements. LLM API circuit breaker extended to ChatCompletions, Response API, and Gemini backends (was Claude-only).

## Install

```bash
pip install massgen==0.1.72
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.72
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.72 — Grok Backend Update & Circuit Breaker Phase 2! 🚀 Updated Grok backend with latest improvements. LLM API circuit breaker extended to ChatCompletions, Response API, and Gemini backends (was Claude-only).

**Key Improvements:**

🦎 **Grok Backend Update** — Updated Grok backend with latest improvements

⚡ **Circuit Breaker Phase 2** — Rate limit protection across all major backends:
- Extended to ChatCompletions, Response API, and Gemini backends (previously Claude-only)
- Gemini backend also handles 503 errors

**Getting Started:**

```bash
pip install massgen==0.1.72
uv run massgen --config @examples/providers/others/grok_x_search.yaml "Research the latest posts and news about AI agents in the last week, and summarize the key trends and insights."
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.72

Feature highlights:

<!-- Paste feature-highlights.md content here -->
