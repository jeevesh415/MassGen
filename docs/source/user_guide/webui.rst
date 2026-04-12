=============
Web UI Guide
=============

The Web UI provides a browser-based interface for real-time visualization
of multi-agent coordination. Watch agents work in parallel, vote, and
converge on solutions through an interactive graphical interface.

Why Use the WebUI?
------------------

The WebUI is ideal for:

* **Visual Monitoring** - See all agents working simultaneously with streaming output
* **Team Demos** - Show stakeholders how multi-agent coordination works
* **Workspace Browsing** - Explore files created by agents with syntax highlighting
* **Vote Analysis** - Understand consensus-building with animated visualizations
* **Timeline Review** - See the full coordination flow as a swimlane diagram

Starting the Web UI
-------------------

Launch the Web UI with the ``--web`` flag:

.. code-block:: bash

   # Basic usage with default config
   uv run massgen --web

   # With a specific configuration
   uv run massgen --web --config @examples/basic/multi/three_agents_default

   # Custom host and port
   uv run massgen --web --web-host 0.0.0.0 --web-port 3000

Open http://localhost:8000 (default) in your browser.

First-Time Setup
----------------

When you run ``uv run massgen --web`` for the first time, you'll be automatically
directed to the **Setup Page** to configure your environment:

**Step 1: API Keys**
   Enter API keys for the providers you want to use (OpenAI, Anthropic, Google, etc.).
   Keys can be saved globally (``~/.massgen/.env``) or locally (``./.env``).

**Step 2: Docker Setup**
   Check Docker availability and pull MassGen runtime images for isolated code execution.
   Docker is optional - you can skip this step if you prefer local execution mode.

**Step 3: Skills**
   View available skills that extend agent capabilities. Skills are enabled via YAML config.

After completing setup, click **Finish Setup** to proceed to the Quickstart Wizard
where you'll configure your first agent team.

.. note::
   You can return to the Setup Page anytime by clicking the **Setup** button in the header
   or navigating directly to ``http://localhost:8000/setup``.

Interface Overview
------------------

**Header Bar**
   Connection status indicator, config selector dropdown, and session controls.

**Agent Carousel**
   Real-time view of all agents and their responses. For 1-3 agents, cards
   display in a grid. For 4+ agents, a carousel with navigation arrows.

**Input Area**
   Question input field with Start/Cancel buttons. After completion,
   a follow-up input appears for multi-turn conversations.

**Status Toolbar**
   Quick access buttons for Answer Browser, Vote Browser, Workspace Browser,
   and Timeline View.

Quickstart Wizard
-----------------

If no configuration is set, the WebUI launches a guided setup wizard:

**Step 1: Docker Check**
   Detects if Docker is available for isolated code execution.

**Step 2: Agent Count**
   Choose how many agents to use (1-5). More agents = more perspectives but longer execution.

**Step 3: Setup Mode**
   - **Quick Setup** - Select a provider (OpenAI, Anthropic, Google, etc.) and model
   - **Browse Examples** - Choose from pre-built configuration templates
   - **Custom YAML** - Write your own configuration

**Step 4: Configuration**
   Review and customize the generated configuration. Set API keys if needed.

**Step 5: Preview & Save**
   Preview the final YAML and optionally save as your default config.

Starting a Session
------------------

1. Select a configuration from the dropdown (or use the one specified via ``--config``)
2. Enter your question in the input field
3. Click **Start** to begin coordination
4. Watch agents generate responses in real-time

Each agent card shows:

* Agent ID and model name
* Current status (waiting, working, voting, complete)
* Response content with syntax highlighting
* Round selector for viewing previous rounds

Display Modes
~~~~~~~~~~~~~

The UI automatically transitions through display modes:

* **Coordination** - Shows all agents in a carousel during the coordination phase
* **Final Streaming** - Shows only the winning agent streaming the final answer after consensus
* **Final Complete** - Full-screen view of the final answer with tabs for workspace and history

Viewing Results
---------------

**Answer Browser** (``A`` key)
   Browse all answers across coordination rounds. Filter by agent,
   expand individual answers, and see which answer was selected as final.

**Vote Browser** (``V`` key)
   View voting patterns and distribution. See which agents voted for
   which answers and their reasoning.

**Workspace Browser** (``W`` key)
   Browse files created by agents in their isolated workspaces.
   Select different agents and view file contents with rich artifact preview.
   Navigate directories, preview HTML/React/markdown files, and download as needed.

**Timeline View** (``T`` key)
   Visualize the coordination timeline as a swimlane diagram. See when
   answers and votes occurred and how the coordination flow progressed.
   Shows answer dependencies (which answers influenced later responses).

Final Answer View
~~~~~~~~~~~~~~~~~

After coordination completes, the final answer displays in a full-screen view with three tabs:

**Answer Tab**
   The complete final answer with full markdown rendering and syntax highlighting.

**Workspace Tab**
   Browse all files in the winning agent's workspace. View source code,
   configuration files, and any artifacts created during execution.

**Conversation Tab**
   Review the full conversation history including all turns in a multi-turn session.

Artifact Preview
~~~~~~~~~~~~~~~~

The WebUI supports rich artifact previews for files created by agents. When you click
on a file in the Workspace Browser or Final Answer workspace tab, the Artifact Preview
modal opens with intelligent rendering based on file type.

**Supported Artifact Types:**

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Category
     - File Types
     - Preview Capabilities
   * - Interactive
     - ``.html``, ``.jsx``, ``.tsx``, ``.vue``
     - Live HTML preview, React/Vue components with Sandpack
   * - Diagrams
     - ``.mermaid``, ``.mmd``
     - Rendered flowcharts, sequence diagrams, and more
   * - Documents
     - ``.md``, ``.pdf``
     - Rendered markdown with styling, native PDF viewer
   * - Graphics
     - ``.svg``, ``.png``, ``.jpg``, ``.gif``, ``.webp``
     - SVG rendering, images with zoom and rotate controls
   * - Office
     - ``.docx``, ``.xlsx``, ``.pptx``
     - Word documents, Excel spreadsheets, PowerPoint slides
   * - Code
     - All other files
     - Syntax-highlighted source code (40+ languages)

**Preview vs Source Toggle:**
   For previewable file types, toggle between "Preview" and "Source" views using
   the buttons in the modal header. Preview shows the rendered artifact while
   Source shows syntax-highlighted code.

**Actions:**
   - **Copy** - Copy file contents to clipboard
   - **Download** - Download the file locally

**Accessing Artifact Preview:**

1. **During Execution** - Press ``W`` to open Workspace Browser, then click any file
2. **After Completion** - Go to Workspace tab in Final Answer view, click any file
3. **Answer Browser** - Press ``A``, go to Workspace tab, click any file

**Preview Indicators:**
   Files that support rich preview are highlighted in violet with an eye icon (👁) in the
   file browser. This makes it easy to identify which files can be previewed vs only
   viewed as source code.

.. tip::
   React and Vue components are rendered using Sandpack, providing a full bundled
   preview with live updates. This works best for standalone components.

Multi-Turn Conversations
------------------------

After a coordination completes:

1. The follow-up input field appears below the final answer
2. Enter your follow-up question
3. Click **Continue** to start a new coordination round
4. View conversation history via the dropdown in the header

Context is preserved across turns, allowing agents to reference
previous answers and build on prior discussion.

Keyboard Shortcuts
------------------

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Key
     - Action
   * - ``A``
     - Open Answer Browser
   * - ``V``
     - Open Vote Browser
   * - ``W``
     - Open Workspace Browser
   * - ``T``
     - Open Timeline View
   * - ``?``
     - Show keyboard shortcuts help
   * - ``1-9``
     - Jump to agent by number
   * - ``Escape``
     - Close current modal

.. tip::
   Shortcuts are disabled when typing in input fields.

Automation Mode
---------------

Combine ``--web`` with ``--automation`` to auto-start a run and watch it in the
full Web UI:

.. code-block:: bash

   uv run massgen --web --automation --config config.yaml "Your question"

When ``--automation`` is combined with ``--web``, a question, and a config:

* The coordination **auto-starts** as soon as the server is ready — no browser
  interaction needed to kick off the run.
* The **full Web UI** is available at the printed URL for monitoring progress,
  browsing answers, viewing the workspace, and inspecting votes.
* Server logs are suppressed to keep stdout clean.
* If no ``--config`` is specified, the default config is auto-resolved
  (same as running without ``--web``).

Use ``--no-browser`` to prevent auto-opening the browser (useful for servers
or when driving MassGen from another process).

**CLI flags work with --web:**

Flags like ``--eval-criteria`` and ``--checklist-criteria-preset`` are forwarded
to the WebUI run, so this works as expected:

.. code-block:: bash

   # Custom evaluation criteria with WebUI monitoring
   uv run massgen --web --automation --no-browser \
     --eval-criteria criteria.json \
     --config config.yaml "Your question"

   # Use a built-in criteria preset
   uv run massgen --web --automation \
     --checklist-criteria-preset evaluation \
     --config config.yaml "Your question"

CLI Options
-----------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - Description
   * - ``--web``
     - Enable Web UI mode
   * - ``--web-port PORT``
     - Server port (default: 8000)
   * - ``--web-host HOST``
     - Server host (default: 127.0.0.1)
   * - ``--no-browser``
     - Don't auto-open browser
   * - ``--eval-criteria FILE``
     - Path to JSON file with custom evaluation criteria (works with ``--web``)
   * - ``--checklist-criteria-preset NAME``
     - Use a built-in criteria preset (works with ``--web``)
   * - ``--orchestrator-timeout SECONDS``
     - Set orchestrator timeout (works with ``--web``)

**Examples:**

.. code-block:: bash

   # Interactive — opens browser, enter question in UI
   massgen --web --config @examples/basic/multi/three_agents_default

   # Auto-start — run begins immediately, open URL to watch
   massgen --web --automation --config config.yaml "Your question"

   # Headless auto-start — no browser, monitor via URL or status.json
   massgen --web --automation --no-browser --config config.yaml "Your question"

   # Custom port
   massgen --web --web-port 3000 --config config.yaml

   # Network access (listen on all interfaces)
   massgen --web --web-host 0.0.0.0 --config config.yaml

Troubleshooting
---------------

**Connection shows "Disconnected"**

* Verify the server is running (check terminal output for errors)
* Check if the port is already in use: ``lsof -i :8000``
* Try a different port with ``--web-port``

**Config dropdown is empty**

* Run ``massgen --init`` to create a default configuration
* Or specify a config directly with ``--config`` flag

**Browser compatibility**

The Web UI works best in modern browsers (Chrome, Firefox, Safari, Edge).
If you experience issues, try clearing browser cache or using incognito mode.

Architecture Notes
------------------

The WebUI consists of:

**Frontend** (React + TypeScript)
   Single-page application using Zustand for state management, Framer Motion
   for animations, Shiki for syntax highlighting, and Sandpack for live code preview.
   Artifact preview uses Mermaid for diagrams, Marked for markdown, and Mammoth/SheetJS
   for Office document rendering.

**Backend** (FastAPI + WebSockets)
   REST API for configuration and session management, WebSocket for real-time
   event streaming during coordination.

**Communication**
   WebSocket connection at ``ws://localhost:8000/ws/{session_id}`` provides
   bidirectional real-time communication. Events include agent content updates,
   vote casts, consensus reached, and final answer streaming.

See Also
--------

* :doc:`sessions/multi_turn_mode` - Multi-turn conversations in CLI
* :doc:`../quickstart/running-massgen` - All running modes
* :doc:`../reference/cli` - CLI reference
* :doc:`concepts` - Core multi-agent concepts
