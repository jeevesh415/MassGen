"""Tests for the prompt improver pre-collab step."""

from __future__ import annotations

import json
from pathlib import Path


def test_prompt_improver_config_defaults():
    """PromptImproverConfig is disabled by default."""
    from massgen.agent_config import PromptImproverConfig

    config = PromptImproverConfig()
    assert config.enabled is False
    assert config.persist_across_turns is False


def test_prompt_improver_config_parsed_from_yaml():
    """PromptImproverConfig is correctly parsed from coordination config."""
    from massgen.cli import _parse_coordination_config

    coord = _parse_coordination_config(
        {
            "prompt_improver": {
                "enabled": True,
                "persist_across_turns": True,
            },
        },
    )
    assert coord.prompt_improver.enabled is True
    assert coord.prompt_improver.persist_across_turns is True


def test_prompt_improver_config_missing_from_yaml():
    """Missing prompt_improver in coordination config uses defaults."""
    from massgen.cli import _parse_coordination_config

    coord = _parse_coordination_config({})
    assert coord.prompt_improver.enabled is False


def test_find_improved_prompt_json(tmp_path: Path):
    """PromptImprover finds and parses improved_prompt.json."""
    from massgen.prompt_improver import PromptImprover

    # Create improved_prompt.json in the standard agent workspace path
    subdir = tmp_path / "subagents" / "prompt_improvement" / "workspace" / "agent_a"
    subdir.mkdir(parents=True)
    prompt_file = subdir / "improved_prompt.json"
    prompt_file.write_text(
        json.dumps(
            {
                "prompt": "Write a deep, sensory poem about the ocean floor.",
                "rationale": "Added specificity about depth and sensory detail.",
            },
        ),
    )

    result = PromptImprover._find_improved_prompt_json(str(tmp_path))
    assert result == "Write a deep, sensory poem about the ocean floor."


def test_find_improved_prompt_json_empty(tmp_path: Path):
    """Returns None when no improved_prompt.json exists."""
    from massgen.prompt_improver import PromptImprover

    result = PromptImprover._find_improved_prompt_json(str(tmp_path))
    assert result is None


def test_find_improved_prompt_json_empty_prompt(tmp_path: Path):
    """Returns None when improved_prompt.json has empty prompt."""
    from massgen.prompt_improver import PromptImprover

    subdir = tmp_path / "subagents" / "prompt_improvement" / "workspace" / "agent_a"
    subdir.mkdir(parents=True)
    prompt_file = subdir / "improved_prompt.json"
    prompt_file.write_text(json.dumps({"prompt": "", "rationale": "reasons"}))

    result = PromptImprover._find_improved_prompt_json(str(tmp_path))
    assert result is None


def test_parse_improved_prompt_from_answer():
    """Extracts improved prompt from agent answer text."""
    from massgen.prompt_improver import _parse_improved_prompt_from_answer

    answer = "Here is the improved version:\n" '{"prompt": "Write a vivid poem.", "rationale": "More specific."}'
    result = _parse_improved_prompt_from_answer(answer)
    assert result == "Write a vivid poem."


def test_parse_improved_prompt_from_answer_no_json():
    """Returns None when answer has no JSON."""
    from massgen.prompt_improver import _parse_improved_prompt_from_answer

    result = _parse_improved_prompt_from_answer("No JSON here.")
    assert result is None


def test_evolution_criteria_in_generation_prompt():
    """The generation prompt includes the evolution criteria."""
    from massgen.prompt_improver import PromptImprover

    prompt = PromptImprover._build_generation_prompt("Write a poem.")
    assert "Preservation" in prompt
    assert "Non-contradiction" in prompt
    assert "Self-containment" in prompt
    assert "Ambition escalation" in prompt
    assert "improved_prompt.json" in prompt
