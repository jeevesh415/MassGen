# MassGen v0.1.70 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.70 — Evaluation Criteria Redesign! 🚀 Redesigned three-tier evaluation criteria system with anti-pattern definitions and aspiration statements. Improved checklist-gated evaluation with tighter iterative submission cycles. Fast iteration mode, WebUI review modal, and background trace analysis from round 2.

## Install

```bash
pip install massgen==0.1.70
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.70
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.70 — Evaluation Criteria Redesign! 🚀 Redesigned three-tier evaluation criteria system with anti-pattern definitions and aspiration statements. Improved checklist-gated evaluation with tighter iterative submission cycles, scoring, and improvement proposals before final voting.

**Key Improvements:**

📋 **Evaluation Criteria Redesign** — Three-tier categorization with anti-patterns:
- `primary` (ONE — where the model needs most push), `standard` (must-pass), `stretch` (nice-to-have)
- Anti-pattern definitions per criterion for sharper evaluation
- Aspiration statements to set the quality bar

🔄 **Improved Checklist-Gated Evaluation** — Tighter iterative refinement before voting:
- Agents submit, get scored against the checklist, receive improvement proposals, and resubmit
- Scoring and gap analysis drive meaningful iteration

**Plus:**
- ⚡ **Fast iteration mode** — Streamlined multi-round submission phases via `fast_iteration.yaml`
- 🔍 **WebUI review modal** — Approve and comment on outputs directly in the browser
- 📊 **Background trace analysis** — Execution trace analyzer starts automatically from round 2
- 🧹 **Workspace cleanup** — Enhanced isolation between rounds

**Getting Started:**

```bash
pip install massgen==0.1.70
# Try fast iteration with redesigned evaluation criteria
uv run massgen --config @examples/features/fast_iteration.yaml "Create an svg of an AI agent coding."
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.70

Feature highlights:

<!-- Paste feature-highlights.md content here -->
