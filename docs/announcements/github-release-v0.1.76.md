# 🚀 Release Highlights — v0.1.76 (2026-04-13)

### 🔍 [Exa AI Search Tool](https://docs.massgen.ai/en/latest/reference/mcp_server_registry.html)
- **AI-powered search via MCP** ([#1057](https://github.com/massgen/MassGen/pull/1057)): New Exa search tool added to MCP server registry with example config

### 📊 [Circuit Breaker Observability (Phase 3)](https://docs.massgen.ai/en/latest/user_guide/backends.html)
- **Full observability** ([#1056](https://github.com/massgen/MassGen/pull/1056)): Probe ownership, lock release mechanisms, and per-attempt latency regression tracking
- **Strengthened across all backends**: Improved circuit breaker reliability and monitoring

### 📋 Checkpoint & Docker
- **Checkpoint agent instructions** ([#1058](https://github.com/massgen/MassGen/pull/1058)): Copyable custom instructions for agent memory files with checkpoint MCP information
- **Docker dependency fixes** ([#1058](https://github.com/massgen/MassGen/pull/1058)): Fixed Dockerfile installs for reliable container builds

---

### 📖 Getting Started
- [**Quick Start Guide**](https://github.com/massgen/MassGen?tab=readme-ov-file#1--installation)
- **Try It**:
  ```bash
  pip install massgen==0.1.76
  uv run massgen --config @examples/tools/web-search/exa_search_example "Research the latest breakthroughs in multi-agent AI systems"
  ```
