# 🚀 Release Highlights — v0.1.75 (2026-04-10)

### 🪝 [Codex Native Hooks](https://docs.massgen.ai/en/latest/user_guide/backends.html)
- **Hybrid hook system** ([#1053](https://github.com/massgen/MassGen/pull/1053)): Codex backend now combines native hooks and MCP capabilities for richer integration with MassGen's coordination

### 🛡️ [Checkpoint WebUI Auto-Launch](https://github.com/massgen/MassGen/blob/main/docs/modules/checkpoint.md)
- **Visual monitoring** ([#1053](https://github.com/massgen/MassGen/pull/1053)): Checkpoint runs now auto-launch the WebUI with configurable host/port
- **Prompt and criteria pass-through**: User/system prompt and eval criteria correctly forwarded to checkpoint agents
- **Improved planning**: Precondition validation and recovery tree support

### 📖 [Standalone MCP Server Docs](https://github.com/massgen/MassGen/blob/main/massgen/mcp_tools/standalone/README.md)
- **Setup guide**: Setup, examples, and troubleshooting for `massgen-checkpoint-mcp`
- **Safety policy integration**: Documentation for configuring safety policies

---

### 📖 Getting Started
- [**Quick Start Guide**](https://github.com/massgen/MassGen?tab=readme-ov-file#1--installation)
- **Try It**:
  ```bash
  pip install massgen==0.1.75
  uv run massgen --config @examples/features/fast_iteration.yaml "Create an svg of an AI agent coding."
  ```
