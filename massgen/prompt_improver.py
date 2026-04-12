"""Pre-collab prompt improvement for MassGen.

Spawns a multi-agent consensus call to rewrite the user's task prompt for
clarity, specificity, and ambition before the main coordination begins.
When generation fails, the original prompt is used unchanged.
"""

import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

from loguru import logger

EVOLUTION_CRITERIA = """\
The improved prompt must satisfy these constraints:
1. Preservation — keep every explicit constraint from the original \
(format, word count, audience, domain, etc.)
2. Non-contradiction — do not contradict or negate anything in the original
3. Self-containment — understandable on its own without evaluation artifacts
4. Directional clarity — encode a clear direction for improvement, not just \
"be better"
5. Ambition escalation — raise the bar beyond what a generic first attempt \
would produce
6. Concreteness — include concrete, actionable specifics, not vague \
aspirations
7. Proportionality — modifications proportional to the gap between a naive \
attempt and a strong one\
"""


class PromptImprover:
    """Generates improved task prompts via multi-agent consensus."""

    def __init__(self) -> None:
        self.last_generation_source: str = "none"

    async def improve_prompt_via_subagent(
        self,
        task: str,
        agent_configs: list[dict[str, Any]],
        parent_workspace: str,
        log_directory: str | None,
        orchestrator_id: str,
        on_subagent_started: Callable | None = None,
        voting_sensitivity: str | None = None,
        voting_threshold: int | None = None,
        fast_iteration_mode: bool = False,
    ) -> str | None:
        """Improve the user's task prompt via a subagent consensus run.

        Returns the improved prompt string, or None on failure (caller
        should fall back to the original prompt).
        """
        logger.info("Improving prompt via subagent consensus")

        improvement_workspace = os.path.join(
            parent_workspace,
            ".prompt_improvement",
        )
        try:
            os.makedirs(improvement_workspace, exist_ok=True)
            context_md = os.path.join(improvement_workspace, "CONTEXT.md")
            with open(context_md, "w", encoding="utf-8") as f:
                f.write(
                    "# Prompt Improvement\n\n" f"Original task:\n{task}\n\n" "Goal: Produce an improved version of the task prompt " "in improved_prompt.json.\n",
                )
        except Exception as e:
            logger.warning(f"Failed to prepare prompt improvement workspace: {e}")
            improvement_workspace = parent_workspace

        try:
            from massgen.subagent.manager import SubagentManager
            from massgen.subagent.models import SubagentOrchestratorConfig

            simplified = []
            for i, config in enumerate(agent_configs):
                backend = config.get("backend", {})
                backend_cfg: dict = {
                    "type": backend.get("type", "openai"),
                    "model": backend.get("model"),
                    "enable_mcp_command_line": False,
                    "enable_code_based_tools": False,
                    "exclude_file_operation_mcps": False,
                }
                if backend.get("base_url"):
                    backend_cfg["base_url"] = backend["base_url"]
                simplified.append(
                    {
                        "id": config.get("id", f"prompt_agent_{i}"),
                        "backend": backend_cfg,
                    },
                )

            coordination: dict[str, Any] = {
                "enable_subagents": False,
                "broadcast": False,
            }
            if voting_sensitivity:
                coordination["voting_sensitivity"] = voting_sensitivity
            if voting_threshold is not None:
                coordination["voting_threshold"] = voting_threshold
            if fast_iteration_mode:
                coordination["fast_iteration_mode"] = True

            subagent_config = SubagentOrchestratorConfig(
                enabled=True,
                agents=simplified,
                coordination=coordination,
            )

            manager = SubagentManager(
                parent_workspace=improvement_workspace,
                parent_agent_id="prompt_improver",
                orchestrator_id=orchestrator_id,
                parent_agent_configs=simplified,
                max_concurrent=1,
                default_timeout=300,
                subagent_orchestrator_config=subagent_config,
                log_directory=log_directory,
            )

            prompt = self._build_generation_prompt(task)

            def _status_callback(subagent_id: str) -> Any | None:
                try:
                    return manager.get_subagent_display_data(subagent_id)
                except Exception:
                    return None

            if on_subagent_started:
                try:
                    subagent_log_path = None
                    if log_directory:
                        subagent_log_path = str(
                            Path(log_directory) / "subagents" / "prompt_improvement",
                        )
                    on_subagent_started(
                        "prompt_improvement",
                        prompt,
                        300,
                        _status_callback,
                        subagent_log_path,
                    )
                except Exception:
                    pass

            result = await manager.spawn_subagent(
                task=prompt,
                subagent_id="prompt_improvement",
                timeout_seconds=300,
            )

            # Try to find improved_prompt.json in output
            if log_directory:
                improved = self._find_improved_prompt_json(log_directory)
                if improved:
                    self.last_generation_source = "subagent"
                    logger.info(
                        "Loaded improved prompt from improved_prompt.json " f"({len(improved)} chars)",
                    )
                    return improved

            # Try parsing from answer text
            if result.answer:
                improved = _parse_improved_prompt_from_answer(result.answer)
                if improved:
                    self.last_generation_source = "subagent"
                    logger.info(
                        f"Parsed improved prompt from answer ({len(improved)} chars)",
                    )
                    return improved

            logger.warning(
                "No valid improved prompt output found, using original",
            )
            self.last_generation_source = "fallback"
            return None

        except Exception as e:
            logger.error(f"Failed to improve prompt via subagent: {e}")
            self.last_generation_source = "fallback"
            return None

    @staticmethod
    def _build_generation_prompt(task: str) -> str:
        return (
            "You are a prompt engineer. Your job is to rewrite the user's "
            "task prompt to be clearer, more specific, and more ambitious "
            "while preserving all original constraints.\n\n"
            f"ORIGINAL TASK:\n{task}\n\n"
            f"{EVOLUTION_CRITERIA}\n\n"
            "Produce your output as a JSON file called `improved_prompt.json` "
            "with this structure:\n"
            "```json\n"
            "{\n"
            '  "prompt": "The rewritten task prompt...",\n'
            '  "rationale": "Brief explanation of what changed and why..."\n'
            "}\n"
            "```\n\n"
            "The improved prompt should be a complete, self-contained task "
            "statement. Do not reference this instruction or the original "
            "prompt within it. A fresh agent seeing only the improved prompt "
            "should know exactly what to do.\n\n"
            "Your answer should be a concise summary of the improvements. "
            "The full improved prompt must be in improved_prompt.json."
        )

    @staticmethod
    def _find_improved_prompt_json(
        log_directory: str,
    ) -> str | None:
        """Search for improved_prompt.json in the subagent output."""
        try:
            from massgen.precollab_utils import find_precollab_artifact

            artifact = find_precollab_artifact(
                log_directory,
                "prompt_improvement",
                "improved_prompt.json",
            )
            if artifact is None:
                return None
            data = json.loads(artifact.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                prompt = str(data.get("prompt") or "").strip()
                if prompt:
                    return prompt
        except Exception as e:
            logger.debug(f"Error searching for improved_prompt.json: {e}")
        return None


def _parse_improved_prompt_from_answer(answer: str) -> str | None:
    """Try to extract an improved prompt from the agent's answer text."""
    try:
        # Look for JSON in the answer
        import re

        json_match = re.search(r"\{[^{}]*\"prompt\"[^{}]*\}", answer, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            prompt = str(data.get("prompt") or "").strip()
            if prompt:
                return prompt
    except (json.JSONDecodeError, TypeError):
        pass
    return None
