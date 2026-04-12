# MassGen v0.1.69 Release Announcement

<!--
This is the current release announcement. Copy this + feature-highlights.md to LinkedIn/X.
After posting, update the social links below.
-->

## Release Summary

We're excited to release MassGen v0.1.69 — WebUI Automation & Improved Skill! 🚀 The WebUI now auto-starts coordination runs without browser interaction. Open the URL at any point mid-run to monitor progress. Plus: MassGen skill redesign for increased usability and integration with the WebUI, and broad WebUI improvements.

## Install

```bash
pip install massgen==0.1.69
```

## Links

- **Release notes:** https://github.com/massgen/MassGen/releases/tag/v0.1.69
- **X post:** [TO BE ADDED AFTER POSTING]
- **LinkedIn post:** [TO BE ADDED AFTER POSTING]

---

## Full Announcement (for LinkedIn)

Copy everything below this line, then append content from `feature-highlights.md`:

---

We're excited to release MassGen v0.1.69 — WebUI Automation & Improved Skill! 🚀 The WebUI now auto-starts coordination runs without browser interaction. Open the URL at any point mid-run to monitor progress. Plus: MassGen skill redesign for increased usability and integration with the WebUI, and broad WebUI improvements.

**Key Improvements:**

🌐 **WebUI Automation Auto-Start** — No browser interaction needed to kick off a run:
- `massgen --web --automation --config config.yaml "Your question"` starts immediately
- Open http://localhost:8000 at any point to monitor a live run
- Web automation correctly auto-ends when a skill completes

🤖 **MassGen Skill Redesign** — Increased usability and integration with the WebUI:
- Skill now launches the WebUI for live session tracking and monitoring

**Plus:**
- 🧙 **Quickstart Wizard rework** — New Welcome, Skills, API Key, Docker, and Setup Mode steps for smoother onboarding
- 🗂️ **Workspace Browser expansion** — WorkspaceModal and improved workspace connection
- 📋 **Flexible criteria fields** — `description` or `name` accepted as alternatives to `text` in criteria JSON

**Getting Started:**

```bash
pip install massgen==0.1.69
# Auto-start a run and watch in WebUI
uv run massgen --web --automation --config config.yaml "Your question"
```

Release notes: https://github.com/massgen/MassGen/releases/tag/v0.1.69

Feature highlights:

<!-- Paste feature-highlights.md content here -->
