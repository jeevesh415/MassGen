"""Tests for GEPA-inspired evaluation criteria generation.

Tests cover:
- Default criteria fallback (when generation is disabled or fails)
- Changedoc mode adds traceability criterion
- Criteria count validation
- Config parsing
- E-prefix on all criteria
- Dynamic core/stretch categories
"""

import json
from types import SimpleNamespace

import pytest

from massgen.evaluation_criteria_generator import (
    VALID_CRITERIA_PRESETS,
    EvaluationCriteriaGenerator,
    EvaluationCriteriaGeneratorConfig,
    get_criteria_for_preset,
    get_default_criteria,
)


class TestDefaultCriteria:
    """Tests for static default criteria."""

    def test_default_criteria_use_e_prefix(self):
        """All default criteria must use E-prefix IDs."""
        criteria = get_default_criteria(has_changedoc=False)
        for c in criteria:
            assert c.id.startswith("E"), f"Expected E-prefix, got {c.id}"

    def test_default_criteria_count(self):
        """Default criteria should have exactly 4 items."""
        criteria = get_default_criteria(has_changedoc=False)
        assert len(criteria) == 4

    def test_default_criteria_have_one_primary(self):
        """Default criteria should have E3 as primary (per-part depth)."""
        criteria = get_default_criteria(has_changedoc=False)
        primary = [c for c in criteria if c.category == "primary"]
        assert len(primary) == 1
        assert primary[0].id == "E3"

    def test_default_criteria_includes_intentional_craft(self):
        """Default criteria must include the intentional craft criterion."""
        criteria = get_default_criteria(has_changedoc=False)
        craft_criteria = [c for c in criteria if "craft" in c.text or "intentional" in c.text]
        assert len(craft_criteria) == 1
        assert craft_criteria[0].id == "E4"

    def test_default_criteria_sequential_ids(self):
        """Default criteria should have sequential E1-E4 IDs."""
        criteria = get_default_criteria(has_changedoc=False)
        ids = [c.id for c in criteria]
        assert ids == ["E1", "E2", "E3", "E4"]


class TestChangedocDefaults:
    """Tests for changedoc mode defaults."""

    def test_changedoc_uses_same_count(self):
        """Changedoc mode should use the same default count as non-changedoc mode."""
        criteria = get_default_criteria(has_changedoc=True)
        assert len(criteria) == 4

    def test_changedoc_defaults_keep_sequential_ids(self):
        """Changedoc mode should keep the same sequential E1-E4 defaults."""
        criteria = get_default_criteria(has_changedoc=True)
        ids = [c.id for c in criteria]
        assert ids == ["E1", "E2", "E3", "E4"]

    def test_changedoc_defaults_do_not_mention_changedoc_traceability(self):
        """Changedoc mode defaults should not append a changedoc-specific criterion."""
        criteria = get_default_criteria(has_changedoc=True)
        joined = " ".join(c.text.lower() for c in criteria)
        assert "changedoc is honest" not in joined
        assert "traceable" not in joined

    def test_changedoc_preserves_base_criteria(self):
        """Changedoc mode should preserve all 4 base criteria unchanged."""
        base = get_default_criteria(has_changedoc=False)
        changedoc = get_default_criteria(has_changedoc=True)
        for i in range(4):
            assert base[i].text == changedoc[i].text


class TestConfig:
    """Tests for EvaluationCriteriaGeneratorConfig."""

    def test_default_config_disabled(self):
        """Config should be disabled by default."""
        config = EvaluationCriteriaGeneratorConfig()
        assert config.enabled is False

    def test_default_min_max_criteria(self):
        """Config should have default min=4 and max=7."""
        config = EvaluationCriteriaGeneratorConfig()
        assert config.min_criteria == 4
        assert config.max_criteria == 7

    def test_persist_across_turns_default(self):
        """Config should not persist across turns by default."""
        config = EvaluationCriteriaGeneratorConfig()
        assert config.persist_across_turns is False

    def test_custom_config(self):
        """Config should accept custom values."""
        config = EvaluationCriteriaGeneratorConfig(
            enabled=True,
            min_criteria=3,
            max_criteria=8,
            persist_across_turns=True,
        )
        assert config.enabled is True
        assert config.min_criteria == 3
        assert config.max_criteria == 8
        assert config.persist_across_turns is True


class TestCriteriaValidation:
    """Tests for criteria parsing and validation."""

    def test_parse_valid_criteria_json(self):
        """Valid JSON with criteria should parse correctly."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [
                    {"text": "Goal alignment check", "category": "core"},
                    {"text": "No broken functionality", "category": "core"},
                    {"text": "Output is thorough", "category": "core"},
                    {"text": "Shows creative craft", "category": "stretch"},
                ],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert len(criteria) == 4
        assert criteria[0].id == "E1"
        assert criteria[0].text == "Goal alignment check"
        assert criteria[0].category == "standard"  # "core" maps to "standard"
        assert criteria[3].category == "stretch"  # "stretch" preserved

    def test_parse_invalid_json_returns_none(self):
        """Invalid JSON should return (None, None) (triggering fallback)."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        criteria, aspiration = _parse_criteria_response("not json at all", min_criteria=4, max_criteria=10)
        assert criteria is None

    def test_parse_too_few_criteria_returns_none(self):
        """Fewer criteria than min should return None."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [
                    {"text": "Only one", "category": "core"},
                ],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is None

    def test_parse_too_many_criteria_returns_none(self):
        """More criteria than max should return None."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [{"text": f"Criterion {i}", "category": "core"} for i in range(15)],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is None

    def test_legacy_categories_mapped(self):
        """Legacy category values should be mapped to new values."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [
                    {"text": "Stretch 1", "category": "stretch"},
                    {"text": "Stretch 2", "category": "could"},
                    {"text": "Core 1", "category": "core"},
                    {"text": "Must 1", "category": "must"},
                ],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert criteria[0].category == "stretch"
        assert criteria[1].category == "stretch"
        assert criteria[2].category == "standard"
        assert criteria[3].category == "standard"

    def test_parse_criteria_from_markdown_code_block(self):
        """Should extract JSON from markdown code blocks."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = """Here are the criteria:

```json
{
    "criteria": [
        {"text": "Goal alignment", "category": "core"},
        {"text": "No defects", "category": "core"},
        {"text": "Thorough output", "category": "core"},
        {"text": "Polish and craft", "category": "stretch"}
    ]
}
```
"""
        criteria, _ = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert len(criteria) == 4

    def test_variable_item_count_6(self):
        """6 criteria with 5 core + 1 stretch should work."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [{"text": f"Core criterion {i}", "category": "core"} for i in range(5)]
                + [
                    {"text": "Stretch criterion", "category": "stretch"},
                ],
            },
        )
        criteria, _ = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert len(criteria) == 6
        assert criteria[5].id == "E6"

    def test_variable_item_count_8(self):
        """8 criteria with 6 core + 2 stretch should work with mapped categories."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [{"text": f"Core criterion {i}", "category": "core"} for i in range(6)] + [{"text": f"Stretch criterion {i}", "category": "stretch"} for i in range(2)],
            },
        )
        criteria, _ = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert len(criteria) == 8
        # core → standard, stretch stays stretch
        assert criteria[0].category == "standard"
        assert criteria[6].category == "stretch"

    def test_parse_with_aspiration_and_anti_patterns(self):
        """New format with aspiration and anti_patterns should parse correctly."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "aspiration": "A poem a journal editor would pause on",
                "criteria": [
                    {
                        "text": "Earned emotion",
                        "category": "primary",
                        "anti_patterns": ["abstract declarations", "greeting-card resolution"],
                    },
                    {"text": "Surprise", "category": "standard"},
                    {"text": "Sound", "category": "standard"},
                    {"text": "Memorable line", "category": "standard"},
                ],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert aspiration == "A poem a journal editor would pause on"
        assert criteria[0].category == "primary"
        assert criteria[0].anti_patterns == ["abstract declarations", "greeting-card resolution"]
        assert criteria[1].category == "standard"
        assert criteria[1].anti_patterns is None

    def test_at_most_one_primary(self):
        """Multiple 'primary' criteria should warn and keep only first."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [
                    {"text": "First primary", "category": "primary"},
                    {"text": "Second primary", "category": "primary"},
                    {"text": "Third", "category": "standard"},
                    {"text": "Fourth", "category": "standard"},
                ],
            },
        )
        criteria, _ = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        primary_count = sum(1 for c in criteria if c.category == "primary")
        assert primary_count == 1
        assert criteria[0].category == "primary"
        assert criteria[1].category == "standard"


class TestGenerationPrompt:
    """Tests for generation prompt construction."""

    def _make_prompt(self, task="Build a website", has_changedoc=False, min_criteria=4, max_criteria=10):
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        return gen._build_generation_prompt(
            task=task,
            has_changedoc=has_changedoc,
            min_criteria=min_criteria,
            max_criteria=max_criteria,
        )

    def test_prompt_includes_task(self):
        """Generation prompt must include the user's task."""
        prompt = self._make_prompt(task="Build a snake game with mobile support")
        assert "snake game" in prompt

    def test_prompt_changedoc_does_not_add_criterion(self):
        """Changedoc traceability is no longer injected as an eval criterion.

        When changedoc was a criterion, agents burned iterations improving
        the changedoc instead of the actual deliverable.  Traceability is
        handled during final presentation instead.
        """
        prompt = self._make_prompt(has_changedoc=True)
        # The changedoc instruction should be empty — no criterion injection
        assert "changedoc traceability" not in prompt.lower()

    def test_prompt_specifies_criteria_range(self):
        """Generation prompt should specify the min-max range."""
        prompt = self._make_prompt(min_criteria=4, max_criteria=10)
        assert "4" in prompt and "10" in prompt

    def test_prompt_mentions_planning_context_alignment(self):
        """Prompt should instruct alignment with available planning/spec context."""
        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt(
            task="Build a website",
            has_changedoc=False,
            min_criteria=4,
            max_criteria=10,
            has_planning_spec_context=True,
        )
        prompt_lower = prompt.lower()
        assert "planning/spec context" in prompt_lower
        assert "align" in prompt_lower

    def test_prompt_omits_planning_context_guidance_when_flag_false(self):
        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt(
            task="Build a website",
            has_changedoc=False,
            min_criteria=4,
            max_criteria=10,
            has_planning_spec_context=False,
        )
        assert "planning/spec context" not in prompt.lower()

    def test_prompt_defines_correctness_dimensions(self):
        """Prompt must define correctness as structural, content, and experiential."""
        prompt = self._make_prompt()
        assert "structural" in prompt.lower()
        assert "content" in prompt.lower()
        assert "experiential" in prompt.lower()

    def test_prompt_separates_correctness_from_craft(self):
        """Prompt must distinguish correctness from craft as separate concepts."""
        prompt = self._make_prompt()
        # Both concepts must be named distinctly
        assert "craft" in prompt.lower()
        assert "correctness" in prompt.lower()
        # The separation must be explicit — correctness and craft are different
        assert "can still be mediocre" in prompt.lower() or "beyond correctness" in prompt.lower()

    def test_prompt_verify_by_required_for_experiential(self):
        """Prompt must make verify_by required (not optional) for experiential criteria."""
        prompt = self._make_prompt()
        assert "verify_by" in prompt
        # Should not describe it as merely optional
        assert "optional" not in prompt.lower()

    def test_prompt_verify_by_requires_full_scope(self):
        """Prompt must instruct verify_by to cover all pages/slides, not a sample."""
        prompt = self._make_prompt()
        assert "all" in prompt.lower()
        assert "sample" in prompt.lower() or "not a sample" in prompt.lower()

    def test_prompt_requires_dedicated_rendering_correctness_criterion(self):
        """Prompt must explicitly require a dedicated criterion for rendering correctness."""
        prompt = self._make_prompt()
        # Must be a numbered requirement, not just guidance
        assert "rendering" in prompt.lower() or "rendered" in prompt.lower()
        # Must say not to merge with craft
        assert "craft" in prompt.lower() and ("separate" in prompt.lower() or "not merge" in prompt.lower())

    def test_prompt_includes_deep_investigation_section(self):
        """Prompt must include a deep investigation section before criteria generation."""
        prompt = self._make_prompt(task="Write a website about gophers")
        lower = prompt.lower()
        # Must instruct the model to investigate what excellence looks like
        assert "investigation" in lower or "investigate" in lower
        # Must ask about exemplars or what excellent output looks like
        assert "excellent" in lower or "exemplar" in lower
        # Must ask about domain-specific failure modes
        assert "failure" in lower or "fail" in lower
        # Must ask about what distinguishes great from good
        assert "distinguish" in lower or "mediocre" in lower

    def test_prompt_requires_score_anchors(self):
        """Prompt must require score_anchors in the output JSON format."""
        prompt = self._make_prompt()
        assert "score_anchors" in prompt
        # Must describe what score levels look like
        assert '"3"' in prompt or "'3'" in prompt or "score of 3" in prompt.lower()
        assert '"9"' in prompt or "'9'" in prompt or "score of 9" in prompt.lower()


class TestScoreAnchors:
    """Tests for score_anchors on GeneratedCriterion and parsing."""

    def test_generated_criterion_has_score_anchors_field(self):
        """GeneratedCriterion should have an optional score_anchors field."""
        from massgen.evaluation_criteria_generator import GeneratedCriterion

        c = GeneratedCriterion(
            id="E1",
            text="Test criterion",
            category="standard",
            score_anchors={"3": "Fundamentally broken", "5": "Works but generic", "7": "Good with gaps", "9": "Excellent"},
        )
        assert c.score_anchors is not None
        assert c.score_anchors["3"] == "Fundamentally broken"
        assert c.score_anchors["9"] == "Excellent"

    def test_generated_criterion_score_anchors_default_none(self):
        """score_anchors should default to None."""
        from massgen.evaluation_criteria_generator import GeneratedCriterion

        c = GeneratedCriterion(id="E1", text="Test", category="standard")
        assert c.score_anchors is None

    def test_parse_criteria_with_score_anchors(self):
        """Score anchors in JSON response should be parsed into GeneratedCriterion."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "aspiration": "A website a designer would screenshot for their portfolio",
                "criteria": [
                    {
                        "text": "Visual craft: Design feels authored, not assembled",
                        "category": "primary",
                        "anti_patterns": ["unmodified library defaults"],
                        "score_anchors": {
                            "3": "Generic template with no custom styling",
                            "5": "Some custom colors but layout is cookie-cutter",
                            "7": "Cohesive color system and typography but spacing is default",
                            "9": "Every visual choice is intentional — color, type, spacing, rhythm",
                        },
                    },
                    {
                        "text": "Content depth",
                        "category": "standard",
                        "score_anchors": {
                            "3": "Thin paragraphs restating obvious facts",
                            "5": "Covers basics but nothing a quick search wouldn't find",
                            "7": "Includes specific details and interesting angles",
                            "9": "Reader learns something genuinely surprising",
                        },
                    },
                    {"text": "Navigation", "category": "standard"},
                    {"text": "Responsiveness", "category": "standard"},
                ],
            },
        )
        criteria, aspiration = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert criteria[0].score_anchors is not None
        assert "3" in criteria[0].score_anchors
        assert "9" in criteria[0].score_anchors
        assert criteria[1].score_anchors is not None
        assert criteria[2].score_anchors is None  # Not provided

    def test_parse_criteria_ignores_invalid_score_anchors(self):
        """Non-dict score_anchors should be ignored (set to None)."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = json.dumps(
            {
                "criteria": [
                    {"text": "C1", "category": "standard", "score_anchors": "not a dict"},
                    {"text": "C2", "category": "standard", "score_anchors": 42},
                    {"text": "C3", "category": "standard"},
                    {"text": "C4", "category": "standard"},
                ],
            },
        )
        criteria, _ = _parse_criteria_response(response, min_criteria=4, max_criteria=10)
        assert criteria is not None
        assert criteria[0].score_anchors is None
        assert criteria[1].score_anchors is None

    def test_inline_criteria_with_score_anchors(self):
        """criteria_from_inline should handle score_anchors."""
        from massgen.evaluation_criteria_generator import criteria_from_inline

        inline = [
            {
                "text": "Visual craft",
                "category": "primary",
                "score_anchors": {
                    "3": "Generic",
                    "5": "Some effort",
                    "7": "Good",
                    "9": "Exceptional",
                },
            },
            {"text": "Content", "category": "standard"},
        ]
        criteria = criteria_from_inline(inline)
        assert criteria[0].score_anchors is not None
        assert criteria[0].score_anchors["7"] == "Good"
        assert criteria[1].score_anchors is None


class TestStaticCriteriaEnrichment:
    """Verify all static criteria have anti_patterns and score_anchors."""

    def test_default_criteria_have_anti_patterns(self):
        """Every default criterion must have non-empty anti_patterns."""
        criteria = get_default_criteria()
        for c in criteria:
            assert c.anti_patterns is not None, f"{c.id} missing anti_patterns"
            assert len(c.anti_patterns) >= 2, f"{c.id} needs at least 2 anti_patterns, has {len(c.anti_patterns)}"

    def test_default_criteria_have_score_anchors(self):
        """Every default criterion must have score_anchors with keys 3, 5, 7, 9."""
        criteria = get_default_criteria()
        for c in criteria:
            assert c.score_anchors is not None, f"{c.id} missing score_anchors"
            for level in ("3", "5", "7", "9"):
                assert level in c.score_anchors, f"{c.id} missing score_anchors[{level}]"

    def test_changedoc_criteria_have_anti_patterns(self):
        """Every changedoc criterion must have non-empty anti_patterns."""
        from massgen.evaluation_criteria_generator import _CHANGEDOC_CRITERIA

        for c in _CHANGEDOC_CRITERIA:
            assert c.anti_patterns is not None, f"{c.id} missing anti_patterns"
            assert len(c.anti_patterns) >= 2, f"{c.id} needs at least 2 anti_patterns"

    def test_changedoc_criteria_have_score_anchors(self):
        """Every changedoc criterion must have score_anchors with keys 3, 5, 7, 9."""
        from massgen.evaluation_criteria_generator import _CHANGEDOC_CRITERIA

        for c in _CHANGEDOC_CRITERIA:
            assert c.score_anchors is not None, f"{c.id} missing score_anchors"
            for level in ("3", "5", "7", "9"):
                assert level in c.score_anchors, f"{c.id} missing score_anchors[{level}]"

    @pytest.mark.parametrize("preset_name", list(VALID_CRITERIA_PRESETS))
    def test_preset_criteria_have_anti_patterns(self, preset_name):
        """Every criterion in every preset must have non-empty anti_patterns."""
        criteria = get_criteria_for_preset(preset_name)
        for c in criteria:
            assert c.anti_patterns is not None, f"{preset_name}/{c.id} missing anti_patterns"
            assert len(c.anti_patterns) >= 2, f"{preset_name}/{c.id} needs at least 2 anti_patterns"

    @pytest.mark.parametrize("preset_name", list(VALID_CRITERIA_PRESETS))
    def test_preset_criteria_have_score_anchors(self, preset_name):
        """Every criterion in every preset must have score_anchors with keys 3, 5, 7, 9."""
        criteria = get_criteria_for_preset(preset_name)
        for c in criteria:
            assert c.score_anchors is not None, f"{preset_name}/{c.id} missing score_anchors"
            for level in ("3", "5", "7", "9"):
                assert level in c.score_anchors, f"{preset_name}/{c.id} missing score_anchors[{level}]"

    @pytest.mark.parametrize("preset_name", list(VALID_CRITERIA_PRESETS))
    def test_every_preset_has_exactly_one_primary(self, preset_name):
        """Every preset must have exactly one PRIMARY criterion."""
        criteria = get_criteria_for_preset(preset_name)
        primary = [c for c in criteria if c.category == "primary"]
        assert len(primary) == 1, f"Preset '{preset_name}' has {len(primary)} PRIMARY criteria, expected 1. " f"Primary IDs: {[c.id for c in primary]}"

    def test_decomposition_execution_criteria_have_anti_patterns(self):
        """Decomposition execution criteria must have anti_patterns."""
        from massgen.evaluation_criteria_generator import (
            build_decomposition_execution_criteria,
        )

        criteria = build_decomposition_execution_criteria("Build the frontend")
        for c in criteria:
            assert c.anti_patterns is not None, f"{c.id} missing anti_patterns"
            assert len(c.anti_patterns) >= 2, f"{c.id} needs at least 2 anti_patterns"

    def test_decomposition_execution_criteria_have_score_anchors(self):
        """Decomposition execution criteria must have score_anchors."""
        from massgen.evaluation_criteria_generator import (
            build_decomposition_execution_criteria,
        )

        criteria = build_decomposition_execution_criteria("Build the frontend")
        for c in criteria:
            assert c.score_anchors is not None, f"{c.id} missing score_anchors"
            for level in ("3", "5", "7", "9"):
                assert level in c.score_anchors, f"{c.id} missing score_anchors[{level}]"


@pytest.mark.asyncio
async def test_subagent_criteria_generation_passes_voting_sensitivity(monkeypatch, tmp_path):
    captured = {}

    class _FakeSubagentManager:
        def __init__(self, *args, **kwargs):
            captured["coordination"] = kwargs["subagent_orchestrator_config"].coordination

        async def spawn_subagent(self, **kwargs):
            return SimpleNamespace(
                success=True,
                answer=json.dumps(
                    {
                        "criteria": [
                            {"text": "Goal alignment", "category": "must"},
                            {"text": "No defects", "category": "must"},
                            {"text": "Depth and completeness", "category": "should"},
                            {"text": "Intentional craft", "category": "should"},
                        ],
                    },
                ),
                error=None,
                workspace_path=None,
            )

        def get_subagent_display_data(self, _subagent_id):
            return None

    monkeypatch.setattr("massgen.subagent.manager.SubagentManager", _FakeSubagentManager)

    generator = EvaluationCriteriaGenerator()
    criteria = await generator.generate_criteria_via_subagent(
        task="Test task",
        agent_configs=[{"id": "agent_a", "backend": {"type": "openai", "model": "gpt-4o-mini"}}],
        has_changedoc=False,
        parent_workspace=str(tmp_path),
        log_directory=None,
        orchestrator_id="orch_test",
        min_criteria=4,
        max_criteria=7,
        voting_sensitivity="checklist_gated",
    )

    assert len(criteria) >= 4
    assert captured["coordination"]["voting_sensitivity"] == "checklist_gated"


@pytest.mark.asyncio
async def test_subagent_criteria_generation_passes_voting_threshold(monkeypatch, tmp_path):
    captured = {}

    class _FakeSubagentManager:
        def __init__(self, *args, **kwargs):
            captured["coordination"] = kwargs["subagent_orchestrator_config"].coordination

        async def spawn_subagent(self, **kwargs):
            return SimpleNamespace(
                success=True,
                answer=json.dumps(
                    {
                        "criteria": [
                            {"text": "Goal alignment", "category": "must"},
                            {"text": "No defects", "category": "must"},
                            {"text": "Depth and completeness", "category": "should"},
                            {"text": "Intentional craft", "category": "should"},
                        ],
                    },
                ),
                error=None,
                workspace_path=None,
            )

        def get_subagent_display_data(self, _subagent_id):
            return None

    monkeypatch.setattr("massgen.subagent.manager.SubagentManager", _FakeSubagentManager)

    generator = EvaluationCriteriaGenerator()
    criteria = await generator.generate_criteria_via_subagent(
        task="Test task",
        agent_configs=[{"id": "agent_a", "backend": {"type": "openai", "model": "gpt-4o-mini"}}],
        has_changedoc=False,
        parent_workspace=str(tmp_path),
        log_directory=None,
        orchestrator_id="orch_test",
        min_criteria=4,
        max_criteria=7,
        voting_sensitivity="checklist_gated",
        voting_threshold=9,
    )

    assert len(criteria) >= 4
    assert captured["coordination"]["voting_threshold"] == 9


@pytest.mark.asyncio
async def test_subagent_criteria_generation_inherits_parent_context_paths_readonly(monkeypatch, tmp_path):
    captured = {}
    parent_context = tmp_path / "spec_frozen"
    parent_context.mkdir()

    class _FakeSubagentManager:
        def __init__(self, *args, **kwargs):
            captured["parent_context_paths"] = kwargs.get("parent_context_paths")

        async def spawn_subagent(self, **kwargs):
            return SimpleNamespace(
                success=True,
                answer=json.dumps(
                    {
                        "criteria": [
                            {"text": "Goal alignment", "category": "must"},
                            {"text": "No defects", "category": "must"},
                            {"text": "Depth and completeness", "category": "should"},
                            {"text": "Intentional craft", "category": "should"},
                        ],
                    },
                ),
                error=None,
                workspace_path=None,
            )

        def get_subagent_display_data(self, _subagent_id):
            return None

    monkeypatch.setattr("massgen.subagent.manager.SubagentManager", _FakeSubagentManager)

    generator = EvaluationCriteriaGenerator()
    criteria = await generator.generate_criteria_via_subagent(
        task="Test task",
        agent_configs=[
            {
                "id": "agent_a",
                "backend": {
                    "type": "openai",
                    "model": "gpt-4o-mini",
                    "context_paths": [{"path": str(parent_context), "permission": "write"}],
                },
            },
        ],
        has_changedoc=False,
        parent_workspace=str(tmp_path),
        log_directory=None,
        orchestrator_id="orch_test",
        min_criteria=4,
        max_criteria=7,
    )

    assert len(criteria) >= 4
    assert captured["parent_context_paths"] is not None
    assert {"path": str(tmp_path.resolve()), "permission": "read"} in captured["parent_context_paths"]
    assert {"path": str(parent_context.resolve()), "permission": "read"} in captured["parent_context_paths"]


@pytest.mark.asyncio
async def test_subagent_criteria_generation_keeps_file_operation_mcps_when_command_line_disabled(monkeypatch, tmp_path):
    captured = {}

    class _FakeSubagentManager:
        def __init__(self, *args, **kwargs):
            captured["parent_agent_configs"] = kwargs.get("parent_agent_configs")

        async def spawn_subagent(self, **kwargs):
            return SimpleNamespace(
                success=True,
                answer=json.dumps(
                    {
                        "criteria": [
                            {"text": "Goal alignment", "category": "must"},
                            {"text": "No defects", "category": "must"},
                            {"text": "Depth and completeness", "category": "should"},
                            {"text": "Intentional craft", "category": "should"},
                        ],
                    },
                ),
                error=None,
                workspace_path=None,
            )

        def get_subagent_display_data(self, _subagent_id):
            return None

    monkeypatch.setattr("massgen.subagent.manager.SubagentManager", _FakeSubagentManager)

    generator = EvaluationCriteriaGenerator()
    criteria = await generator.generate_criteria_via_subagent(
        task="Test task",
        agent_configs=[{"id": "agent_a", "backend": {"type": "openai", "model": "gpt-4o-mini"}}],
        has_changedoc=False,
        parent_workspace=str(tmp_path),
        log_directory=None,
        orchestrator_id="orch_test",
        min_criteria=4,
        max_criteria=7,
    )

    assert len(criteria) >= 4
    assert captured["parent_agent_configs"] is not None
    backend = captured["parent_agent_configs"][0]["backend"]
    assert backend["enable_mcp_command_line"] is False
    assert backend["exclude_file_operation_mcps"] is False


@pytest.mark.asyncio
async def test_subagent_criteria_generation_omits_null_base_url_for_claude_code(monkeypatch, tmp_path):
    """base_url: null must not appear in simplified configs — claude_code rejects it."""
    captured = {}

    class _FakeSubagentManager:
        def __init__(self, *args, **kwargs):
            captured["parent_agent_configs"] = kwargs.get("parent_agent_configs")

        async def spawn_subagent(self, **kwargs):
            return SimpleNamespace(
                success=True,
                answer=json.dumps(
                    {
                        "criteria": [
                            {"text": "Goal alignment", "category": "must"},
                            {"text": "No defects", "category": "must"},
                            {"text": "Depth and completeness", "category": "should"},
                            {"text": "Intentional craft", "category": "should"},
                        ],
                    },
                ),
                error=None,
                workspace_path=None,
            )

        def get_subagent_display_data(self, _subagent_id):
            return None

    monkeypatch.setattr("massgen.subagent.manager.SubagentManager", _FakeSubagentManager)

    generator = EvaluationCriteriaGenerator()
    criteria = await generator.generate_criteria_via_subagent(
        task="Test task",
        agent_configs=[{"id": "parent", "backend": {"type": "claude_code", "model": "claude-sonnet-4-6"}}],
        has_changedoc=False,
        parent_workspace=str(tmp_path),
        log_directory=None,
        orchestrator_id="orch_test",
        min_criteria=4,
        max_criteria=7,
    )

    assert len(criteria) >= 4
    backend = captured["parent_agent_configs"][0]["backend"]
    assert "base_url" not in backend, "base_url: null leaked into claude_code simplified config"
