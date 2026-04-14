MCP Server Registry
===================

MassGen includes a curated registry of recommended MCP (Model Context Protocol) servers
that are automatically available when auto-discovery is enabled.

Overview
--------

The MCP server registry provides pre-configured, tested MCP servers that extend
agent capabilities. When you enable ``auto_discover_custom_tools: true`` in your
configuration, these servers are automatically included if their API keys are
available (or not required).

**Registry Location:** ``massgen/mcp_tools/server_registry.py``

Available Servers
-----------------

Context7
~~~~~~~~

**Purpose:** Up-to-date code documentation for libraries and frameworks

**Type:** stdio (local) or streamable-http (remote)

**API Key:** Optional (``CONTEXT7_API_KEY``)

**Connection:**

.. code-block:: yaml

   mcp_servers:
     - name: "context7"
       type: "stdio"
       command: "npx"
       args: ["-y", "@upstash/context7-mcp"]

**Tools:**

- ``resolve_context7_library_id`` - Convert library names to Context7 IDs
- ``get_library_docs`` - Fetch version-specific documentation (1K-50K tokens)

**Key Features:**

- No API key required for basic use
- Get API key at https://context7.com/dashboard for higher rate limits
- Eliminates outdated information and hallucinated APIs
- Provides current, version-specific documentation

**Important Notes:**

- Outputs can be very large (5K-50K tokens)
- **Recommended:** Write output to file first, then parse
- Use ``topic`` parameter to narrow results
- Adjust ``tokens`` parameter (default: 5000, max: 50000)

**Use Cases:**

- Getting latest framework documentation (React, Next.js, Vue, etc.)
- Finding current API references
- Learning about new features in recent versions
- Avoiding outdated or hallucinated information

**Example:**

.. code-block:: yaml

   # See: massgen/configs/tools/mcp/context7_documentation_example.yaml

Brave Search
~~~~~~~~~~~~

**Purpose:** Web search via Brave API

**Type:** stdio

**API Key:** Required (``BRAVE_API_KEY``)

**Connection:**

.. code-block:: yaml

   mcp_servers:
     - name: "brave_search"
       type: "stdio"
       command: "npx"
       args: ["-y", "@brave/brave-search-mcp-server"]
       env:
         BRAVE_API_KEY: "${BRAVE_API_KEY}"

**Tools:**

- ``brave_web_search`` - Perform web searches
- Additional tools for local search, summarization (Pro tier)

**Key Features:**

- Real-time web search results
- Free tier: 2000 queries/month
- Pro tier: Enhanced features (local search, summarization, extra snippets)

**API Key Setup:**

1. Sign up at https://brave.com/search/api/
2. Generate API key from dashboard
3. Add to ``.env``: ``BRAVE_API_KEY="your_key_here"``

**Rate Limit Warning:**

⚠️  **Free tier limited to 2000 queries/month**

- Execute searches sequentially, not in parallel
- Avoid repeated searches
- Combine multiple questions into single queries
- Consider Pro tier for heavy usage

**Use Cases:**

- Current events and recent information
- Latest trends and updates
- Real-time data queries
- Information not in LLM training data
- Fact verification

**Example:**

.. code-block:: yaml

   # See: massgen/configs/tools/mcp/brave_search_example.yaml

Exa Search
~~~~~~~~~~

**Purpose:** AI-powered web search and page fetch via Exa's official MCP server

**Type:** stdio

**API Key:** Required (``EXA_API_KEY``)

**Connection:**

.. code-block:: yaml

   mcp_servers:
     - name: "exa_search"
       type: "stdio"
       command: "npx"
       args: ["-y", "exa-mcp-server"]
       env:
         EXA_API_KEY: "${EXA_API_KEY}"

MassGen currently wires Exa through the official npm package (``npx -y exa-mcp-server``).
Exa's current docs also highlight a hosted MCP endpoint (``https://mcp.exa.ai/mcp``)
for clients that support HTTP MCP directly.

**Tools:**

- ``web_search_exa`` - Search the web and return ready-to-use content
- ``web_fetch_exa`` - Read a webpage's full content as clean markdown from a URL
- ``web_search_advanced_exa`` - Advanced search with category, domain, date, highlight, and summary controls

**Key Features:**

- Search the web with Exa's AI-oriented ranking and content extraction
- Fetch a known page as clean markdown for summarization or downstream analysis
- Advanced search options documented by Exa include category, domain, and date filters
- Official Exa docs currently prefer the hosted MCP endpoint for HTTP-capable clients,
  while MassGen's registry uses the official npm package form above

**API Key Setup:**

1. Sign up at https://exa.ai/
2. Generate API key from dashboard
3. Add to ``.env``: ``EXA_API_KEY="your_key_here"``

**Use Cases:**

- Research queries requiring semantic understanding
- Fetching and summarizing the full contents of a known page
- Category-specific searches (research papers, news, companies)
- Time-bounded or domain-restricted searches when advanced Exa tooling is enabled

**Example:**

.. code-block:: yaml

   # See: massgen/configs/tools/web-search/exa_search_example.yaml

Auto-Discovery
--------------

When ``auto_discover_custom_tools: true`` is set in your backend configuration,
MassGen automatically includes registry servers that are available:

**Always Included:**

- Context7 (no API key required)

**Conditionally Included:**

- Brave Search (only if ``BRAVE_API_KEY`` is set in ``.env``)
- Exa Search (only if ``EXA_API_KEY`` is set in ``.env``)

**Behavior:**

1. Checks which registry servers have required API keys available
2. Merges available servers into ``mcp_servers`` configuration
3. Avoids duplicates if server is already manually configured
4. Logs which servers were added and which were skipped

**Example:**

.. code-block:: yaml

   agents:
     - id: "research_agent"
       backend:
         type: "gemini"
         model: "gemini-2.5-flash"
         auto_discover_custom_tools: true  # Automatically adds registry servers!

**Log Output:**

.. code-block:: text

   [gemini] Auto-discovery enabled: Added MCP servers from registry: context7
   [gemini] Registry servers not added (missing API keys): brave_search (needs BRAVE_API_KEY)

Registry Summary Table
----------------------

.. list-table::
   :header-rows: 1
   :widths: 15 10 15 15 45

   * - Server
     - Type
     - API Key
     - Rate Limits
     - Notes
   * - Context7
     - stdio
     - Optional
     - None
     - Large outputs (write to files). Optional API key for higher rate limits.
   * - Brave Search
     - stdio
     - Required
     - 2000/month (free)
     - Avoid parallel queries. Pro tier available for heavy usage.
   * - Exa Search
     - stdio
     - Required
     - Pay-per-use
     - AI-powered neural search. Supports category filtering, content extraction, and deep search.

Manual Configuration
--------------------

You can manually configure any registry server without auto-discovery:

.. code-block:: yaml

   agents:
     - id: "my_agent"
       backend:
         type: "claude"
         model: "claude-sonnet-4"
         mcp_servers:
           - name: "context7"
             type: "stdio"
             command: "npx"
             args: ["-y", "@upstash/context7-mcp"]

This gives you full control over which servers to include and their configuration.

See Also
--------

- :doc:`../user_guide/tools/mcp_integration` - Complete MCP integration guide
- :doc:`yaml_schema` - YAML configuration schema
- ``massgen/configs/tools/mcp/`` - Example configurations
