"""Tests for refinement quality improvements (anchoring problem).

Covers:
- Part A: Prompt quality improvements (Changes 1-6)
- Part B: Critic subagent type
- Part C: Evaluation criteria revamp (MUST/SHOULD/COULD tiers)
"""

from pathlib import Path

from massgen.system_prompt_sections import (
    NoveltyPressureSection,
    _build_checklist_gated_decision,
    _build_checklist_scored_decision,
)

# ===========================================================================
# Part A: Prompt Quality Improvements
# ===========================================================================


class TestScoreCalibration:
    """Change 1: Recalibrated score anchors."""

    def test_scored_decision_has_recalibrated_anchors(self):
        """Score calibration places 'most first drafts' at 5-6 level."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=items,
        )
        assert "Most first drafts belong here" in result

    def test_scored_decision_no_first_attempts_above_7(self):
        """Old 'first attempts almost never deserve above 7' is removed."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=items,
        )
        assert "First attempts almost never deserve above 7" not in result

    def test_scored_decision_has_consistency_rule(self):
        """Score calibration includes soft consistency rule."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=items,
        )
        assert "MUST be consistent with" in result

    def test_scored_decision_displays_score_anchors(self):
        """Score anchors should appear in the scored decision prompt."""
        items = ["Visual craft: Design feels authored", "Content depth"]
        anchors = {
            "E1": {
                "3": "Generic template with no custom styling",
                "5": "Some custom colors but layout is cookie-cutter",
                "7": "Cohesive color system and typography",
                "9": "Every visual choice is intentional",
            },
        }
        result = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=items,
            item_score_anchors=anchors,
        )
        assert "Score anchors:" in result
        assert "3/10: Generic template" in result
        assert "9/10: Every visual choice is intentional" in result
        # E2 has no anchors, should not show anchor section for it
        assert result.count("Score anchors:") == 1

    def test_gated_decision_has_recalibrated_anchors(self):
        """Gated decision also has recalibrated score anchors."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_gated_decision(checklist_items=items)
        assert "Most first drafts belong here" in result

    def test_gated_decision_no_first_attempts_above_7(self):
        """Old 'first attempts almost never deserve above 7' is removed from gated."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_gated_decision(checklist_items=items)
        assert "First attempts almost never deserve above 7" not in result

    def test_gated_decision_has_consistency_rule(self):
        """Gated decision has consistency rule."""
        items = ["E1 criterion", "E2 criterion"]
        result = _build_checklist_gated_decision(checklist_items=items)
        assert "MUST be consistent with" in result

    def test_publish_as_is_at_9_10(self):
        """9-10 described as 'professional would publish as-is'."""
        items = ["E1 criterion"]
        result = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=items,
        )
        assert "publish this as-is" in result


class TestPriorAnswerReframing:
    """Change 3: Reframe prior answers as benchmarks."""

    def test_changedoc_subsequent_has_evaluating_prior_answers(self):
        """Subsequent round prompt analyzes each answer independently."""
        from massgen.system_prompt_sections import ChangedocSection

        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        assert "analyze each existing answer independently" in content
        assert "uniquely well" in content

    def test_no_pick_one_as_base(self):
        """Old 'do not pick one as your base' is replaced."""
        from massgen.system_prompt_sections import ChangedocSection

        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        assert 'do not pick one as your "base" and refine it' not in content


class TestProactiveNovelty:
    """Change 5: NoveltyPressureSection proactive at consecutive=0."""

    def test_novelty_proactive_at_zero_consecutive(self):
        """NoveltyPressureSection produces proactive message at consecutive=0."""
        section = NoveltyPressureSection(
            novelty_level="gentle",
            consecutive_incremental_rounds=0,
            restart_count=0,
        )
        content = section.build_content()
        assert "RIGHT approach" in content or "right approach" in content.lower()
        assert "CURRENT approach" in content or "current approach" in content.lower()

    def test_novelty_gentle_still_works_at_1(self):
        """Gentle level still works at consecutive=1 (existing behavior)."""
        section = NoveltyPressureSection(
            novelty_level="gentle",
            consecutive_incremental_rounds=1,
            restart_count=0,
        )
        content = section.build_content()
        assert "fundamentally different approach" in content


class TestCriticFraming:
    """Change 6: Critic framing in evaluation system message."""

    def test_evaluation_system_message_has_critic_framing(self):
        """evaluation_system_message() contains 'as a critic'."""
        from massgen.message_templates import MessageTemplates

        templates = MessageTemplates()
        msg = templates.evaluation_system_message()
        assert "as a critic" in msg

    def test_critic_framing_mentions_genuinely_good(self):
        """Critic framing asks whether work is genuinely good."""
        from massgen.message_templates import MessageTemplates

        templates = MessageTemplates()
        msg = templates.evaluation_system_message()
        assert "genuinely good" in msg


# ===========================================================================
# Part B: Critic Subagent
# ===========================================================================


class TestCriticSubagent:
    """Tests for critic subagent type."""

    def test_critic_in_default_subagent_types(self):
        """critic is in DEFAULT_SUBAGENT_TYPES."""
        from massgen.subagent.type_scanner import DEFAULT_SUBAGENT_TYPES

        assert "critic" in DEFAULT_SUBAGENT_TYPES

    def test_critic_subagent_md_exists(self):
        """critic SUBAGENT.md file exists."""
        critic_md = Path(__file__).parent.parent / "subagent_types" / "critic" / "SUBAGENT.md"
        assert critic_md.exists(), f"Expected {critic_md} to exist"

    def test_critic_discovered_by_scanner(self):
        """scan_subagent_types discovers critic type."""
        from massgen.subagent.type_scanner import scan_subagent_types

        builtin_dir = Path(__file__).parent.parent / "subagent_types"
        types = scan_subagent_types(
            builtin_dir=builtin_dir,
            project_dir=Path("/nonexistent"),
            allowed_types=["critic"],
        )
        names = [t.name for t in types]
        assert "critic" in names

    def test_default_types_still_excludes_novelty(self):
        """novelty is still excluded from DEFAULT_SUBAGENT_TYPES."""
        from massgen.subagent.type_scanner import DEFAULT_SUBAGENT_TYPES

        assert "novelty" not in DEFAULT_SUBAGENT_TYPES

    def test_default_types_preserves_existing(self):
        """Existing types (evaluator, explorer, researcher) still present."""
        from massgen.subagent.type_scanner import DEFAULT_SUBAGENT_TYPES

        assert "evaluator" in DEFAULT_SUBAGENT_TYPES
        assert "explorer" in DEFAULT_SUBAGENT_TYPES
        assert "researcher" in DEFAULT_SUBAGENT_TYPES


class TestNoveltySubagentQualityRevamp:
    """Tests for novelty subagent quality/craft direction."""

    def test_novelty_subagent_mentions_quality_revamp(self):
        """Novelty SUBAGENT.md should mention quality/craft revamp as a direction."""
        novelty_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = novelty_md.read_text()
        assert "Quality/craft revamp" in content or "quality/craft revamp" in content

    def test_novelty_warns_against_feature_accumulation(self):
        """Novelty SUBAGENT.md should warn against adding more features on a weak foundation."""
        novelty_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = novelty_md.read_text()
        assert "add more features" in content.lower() or "feature accumulation" in content.lower()

    def test_novelty_not_just_additive(self):
        """Novelty constraints should explicitly warn against 'add more' as a direction."""
        novelty_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = novelty_md.read_text()
        assert "rebuild" in content.lower() or "foundation" in content.lower()

    def test_novelty_requires_verbatim_evaluation_input_packet(self):
        """Novelty subagent should require verbatim evaluation input and avoid re-evaluation."""
        novelty_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = novelty_md.read_text().lower()
        assert "evaluation input" in content
        assert "verbatim" in content
        assert "do not re-evaluate" in content


class TestQualityRethinkingInputContract:
    """Tests for quality_rethinking subagent evaluation-input contract."""

    def test_quality_rethinking_requires_verbatim_evaluation_input_packet(self):
        """Quality rethinking subagent should consume evaluation packet verbatim and not re-score."""
        quality_md = Path(__file__).parent.parent / "subagent_types" / "quality_rethinking" / "SUBAGENT.md"
        content = quality_md.read_text().lower()
        assert "evaluation input" in content
        assert "verbatim" in content
        assert "do not re-evaluate" in content


class TestCriticChecklistGuidance:
    """Tests for parallel critic + novelty spawning guidance."""

    def test_checklist_mentions_novelty_not_critic_when_both_available(self):
        """When critic and novelty are both available and criteria have plateaued, guidance mentions novelty only (critic removed from plateau loop)."""
        from massgen.mcp_tools.checklist_tools_server import (
            evaluate_checklist_submission,
        )

        items = ["criterion 1", "criterion 2"]
        # Build a minimal state with both critic and novelty available
        state = {
            "threshold": 5,
            "items": items,
            "remaining_rounds": 3,
            "total_rounds": 5,
            "item_prefix": "E",
            "item_categories": {"E1": "core", "E2": "core"},
            "mode": "checklist_gated",
            "cutoff": 7,
            "required": 2,
            "novelty_subagent_enabled": True,
            "critic_subagent_enabled": True,
            "has_existing_answers": True,
        }
        scores = {
            "E1": {"score": 4, "reasoning": "needs work"},
            "E2": {"score": 4, "reasoning": "needs work"},
        }
        # Build checklist_history with 2 rounds of flat scores to trigger
        # per-criterion plateau detection
        checklist_history = [
            {
                "items_detail": [
                    {"id": "E1", "score": 4, "passed": False},
                    {"id": "E2", "score": 4, "passed": False},
                ],
            },
            {
                "items_detail": [
                    {"id": "E1", "score": 4, "passed": False},
                    {"id": "E2", "score": 4, "passed": False},
                ],
            },
        ]
        result = evaluate_checklist_submission(
            scores=scores,
            report_path="",
            items=items,
            state=state,
            checklist_history=checklist_history,
        )
        # Verdict must be new_answer; guidance should mention novelty (not critic)
        assert result.get("verdict") == "new_answer", f"Expected 'new_answer' but got {result.get('verdict')!r}; full result: {result}"
        explanation = result.get("explanation", "")
        assert "plateaued" in explanation.lower(), f"Expected 'plateaued' in explanation: {explanation}"
        assert "novelty" in explanation.lower()
        assert "spawn a `critic`" not in explanation
        assert "spawn two background" not in explanation


# ===========================================================================
# Part C: Evaluation Criteria Revamp
# ===========================================================================


class TestCriteriaTierSystem:
    """Tests for MUST/SHOULD/COULD tier system."""

    def test_generated_criterion_accepts_must(self):
        """GeneratedCriterion accepts 'must' category."""
        from massgen.evaluation_criteria_generator import GeneratedCriterion

        c = GeneratedCriterion(id="E1", text="test", category="must")
        assert c.category == "must"

    def test_generated_criterion_accepts_should(self):
        """GeneratedCriterion accepts 'should' category."""
        from massgen.evaluation_criteria_generator import GeneratedCriterion

        c = GeneratedCriterion(id="E1", text="test", category="should")
        assert c.category == "should"

    def test_generated_criterion_accepts_could(self):
        """GeneratedCriterion accepts 'could' category."""
        from massgen.evaluation_criteria_generator import GeneratedCriterion

        c = GeneratedCriterion(id="E1", text="test", category="could")
        assert c.category == "could"

    def test_backward_compat_core_maps_to_standard(self):
        """Parsing 'core' maps to 'standard' and 'stretch' maps to 'stretch'."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = '{"criteria": [' '{"text": "t1", "category": "core"},' '{"text": "t2", "category": "core"},' '{"text": "t3", "category": "core"},' '{"text": "t4", "category": "stretch"}' "]}"
        criteria, aspiration = _parse_criteria_response(response)
        assert criteria is not None
        for c in criteria:
            assert c.category in ("standard", "stretch")

    def test_new_categories_parsed_to_standard(self):
        """Input categories (must/should/could) are mapped to standard/standard/stretch."""
        from massgen.evaluation_criteria_generator import _parse_criteria_response

        response = '{"criteria": [' '{"text": "t1", "category": "must"},' '{"text": "t2", "category": "must"},' '{"text": "t3", "category": "should"},' '{"text": "t4", "category": "could"}' "]}"
        criteria, aspiration = _parse_criteria_response(response)
        assert criteria is not None
        for c in criteria:
            assert c.category in ("primary", "standard", "stretch")


class TestDefaultCriteriaTiers:
    """Tests for default criteria using new tier names."""

    def test_default_categories_have_one_primary(self):
        """Default categories have exactly one 'primary' (E3 per-part depth)."""
        from massgen.evaluation_criteria_generator import _DEFAULT_CRITERIA

        categories = [c.category for c in _DEFAULT_CRITERIA]
        assert categories.count("primary") == 1
        assert categories[2] == "primary"  # E3
        assert all(c == "standard" for i, c in enumerate(categories) if i != 2)

    def test_default_criteria_have_one_primary(self):
        """get_default_criteria returns criteria with E3 as primary."""
        from massgen.evaluation_criteria_generator import get_default_criteria

        criteria = get_default_criteria(has_changedoc=False)
        primary = [c for c in criteria if c.category == "primary"]
        assert len(primary) == 1
        assert primary[0].id == "E3"

    def test_default_criteria_include_intentional_craft(self):
        """Default criteria include an intentional craft criterion."""
        from massgen.evaluation_criteria_generator import get_default_criteria

        criteria = get_default_criteria(has_changedoc=False)
        craft = [c for c in criteria if "intentional" in c.text or "craft" in c.text]
        assert len(craft) == 1
        assert craft[0].id == "E4"


class TestPresetsTiers:
    """Tests for presets using new tier names."""

    def test_persona_preset_uses_new_tiers(self):
        """Persona preset uses standard/primary only."""
        from massgen.evaluation_criteria_generator import _CRITERIA_PRESETS

        categories = {c.category for c in _CRITERIA_PRESETS["persona"]}
        assert "core" not in categories
        assert "stretch" not in categories

    def test_decomposition_preset_uses_new_tiers(self):
        """Decomposition preset uses standard/primary only."""
        from massgen.evaluation_criteria_generator import _CRITERIA_PRESETS

        categories = {c.category for c in _CRITERIA_PRESETS["decomposition"]}
        assert "core" not in categories

    def test_evaluation_preset_uses_new_tiers(self):
        """Evaluation preset uses standard/primary only."""
        from massgen.evaluation_criteria_generator import _CRITERIA_PRESETS

        categories = {c.category for c in _CRITERIA_PRESETS["evaluation"]}
        assert "core" not in categories

    def test_prompt_preset_uses_new_tiers(self):
        """Prompt preset uses standard/primary only."""
        from massgen.evaluation_criteria_generator import _CRITERIA_PRESETS

        categories = {c.category for c in _CRITERIA_PRESETS["prompt"]}
        assert "core" not in categories

    def test_analysis_preset_uses_new_tiers(self):
        """Analysis preset uses standard/primary only."""
        from massgen.evaluation_criteria_generator import _CRITERIA_PRESETS

        categories = {c.category for c in _CRITERIA_PRESETS["analysis"]}
        assert "core" not in categories


class TestGenerationPromptTiers:
    """Tests for the updated generation prompt."""

    def test_generation_prompt_has_correctness_and_craft_concepts(self):
        """Generation prompt still covers correctness and craft even without tier labels."""
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt("test task", has_changedoc=False)
        assert "correctness" in prompt.lower()
        assert "craft" in prompt.lower()
        # Tier system section should be removed
        assert "## Tier System" not in prompt

    def test_generation_prompt_has_concrete_examples(self):
        """Generation prompt includes concrete vs abstract examples."""
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt("test task", has_changedoc=False)
        assert "BAD" in prompt and "abstract" in prompt.lower()
        assert "GOOD" in prompt and "concrete" in prompt.lower()

    def test_generation_prompt_requires_quality_craft(self):
        """Generation prompt requires a quality/craft criterion."""
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt("test task", has_changedoc=False)
        assert "quality/craft" in prompt.lower() or "overall quality" in prompt.lower()
        assert "mediocre" in prompt.lower()

    def test_generation_prompt_requires_per_part_quality(self):
        """Generation prompt requires per-part quality evaluation."""
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt("test task", has_changedoc=False)
        lower = prompt.lower()
        # Must mention per-part or per-section quality concept
        assert "per-part" in lower or "each significant part" in lower
        # Must mention evaluating the weakest component, not the average
        assert "weakest" in lower

    def test_generation_prompt_per_part_bad_good_example(self):
        """Generation prompt has BAD/GOOD example for whole-output vs per-part."""
        from massgen.evaluation_criteria_generator import EvaluationCriteriaGenerator

        gen = EvaluationCriteriaGenerator()
        prompt = gen._build_generation_prompt("test task", has_changedoc=False)
        lower = prompt.lower()
        # Must have a BAD example about whole-output criteria
        assert "whole-output" in lower or "whole output" in lower
        # Must have a GOOD example about per-part/per-section criteria
        assert "per-part" in lower or "per-section" in lower

    def test_draft_approach_example_not_incremental(self):
        """System prompt draft_approach example shows substantial improvements."""
        from massgen.system_prompt_sections import _build_checklist_gated_decision

        prompt = _build_checklist_gated_decision(
            checklist_items=["Criterion 1", "Criterion 2"],
        )
        # The example should NOT contain trivially incremental fixes
        assert "fix font sizes" not in prompt.lower()
        # The example should show rethinking, not pixel tweaks
        assert "draft_approach" in prompt

    def test_draft_approach_example_includes_preserve(self):
        """System prompt draft_approach example includes preserve parameter."""
        from massgen.system_prompt_sections import _build_checklist_gated_decision

        prompt = _build_checklist_gated_decision(
            checklist_items=["Criterion 1", "Criterion 2"],
        )
        # preserve should appear in the example call
        assert "preserve" in prompt

    def test_draft_approach_example_has_sources(self):
        """System prompt draft_approach example includes sources."""
        from massgen.system_prompt_sections import _build_checklist_gated_decision

        prompt = _build_checklist_gated_decision(
            checklist_items=["Criterion 1", "Criterion 2"],
        )
        # sources should appear in the structured improvement example
        assert "sources" in prompt


# ===========================================================================
# Part D: Per-Answer Analysis Across All Evaluation Modes
# ===========================================================================


class TestPerAnswerAnalysis:
    """Per-answer analysis: agents must analyze each answer before deciding."""

    def test_strict_mode_has_per_answer_step(self):
        """Strict evaluation contains per-answer strengths step."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="strict")
        content = section.build_content()
        # Must reference analyzing each answer, not just "the best answer"
        assert "each existing answer" in content.lower() or "per-answer" in content.lower()

    def test_balanced_mode_has_per_answer_step(self):
        """Balanced evaluation contains per-answer analysis."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="balanced")
        content = section.build_content()
        assert "each existing answer" in content.lower() or "per-answer" in content.lower()

    def test_adversarial_mode_has_per_answer_step(self):
        """Adversarial evaluation references multiple answers."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="adversarial")
        content = section.build_content()
        assert "each answer" in content.lower()

    def test_consistency_mode_has_per_answer_step(self):
        """Consistency evaluation references multiple approaches."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="consistency")
        content = section.build_content()
        assert "each answer" in content.lower() or "different approaches" in content.lower()

    def test_reflective_mode_has_per_answer_step(self):
        """Reflective evaluation has per-answer fit analysis."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="reflective")
        content = section.build_content()
        assert "each answer" in content.lower() or "per-answer" in content.lower()

    def test_improve_vary_replaced_with_synthesis(self):
        """New answer strategies mention analyzing each existing answer."""
        from massgen.system_prompt_sections import EvaluationSection

        section = EvaluationSection(voting_sensitivity="strict")
        content = section.build_content()
        # Old "Improve/Vary" replaced with synthesis-focused language
        assert "each existing answer" in content.lower()
        # Should have Synthesize and Rethink strategies
        assert "synthesize" in content.lower()
        assert "rethink" in content.lower()

    def test_decision_block_iterate_not_single_base(self):
        """Iterate action says 'each existing answer', not 'from scratch'."""
        from massgen.system_prompt_sections import (
            _build_checklist_decision,
            _build_checklist_scored_decision,
        )

        # Check checklist decision
        result1 = _build_checklist_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=["E1", "E2"],
        )
        assert "each existing answer" in result1.lower()
        assert "from scratch" not in result1.lower()

        # Check checklist_scored decision
        result2 = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=["E1", "E2"],
        )
        assert "each existing answer" in result2.lower()
        assert "from scratch" not in result2.lower()

    def test_checklist_flow_elevation_prompt_before_propose(self):
        """Checklist gated prompt has vision-first elevation prompt before draft_approach call."""
        from massgen.system_prompt_sections import _build_checklist_gated_decision

        prompt = _build_checklist_gated_decision(
            checklist_items=["Criterion 1", "Criterion 2"],
        )
        lower = prompt.lower()
        # Must have a vision-first elevation prompt
        assert "what would great look like" in lower, "Must have elevation prompt before draft_approach"
        # The elevation prompt should appear BEFORE the detailed draft_approach
        # call instruction (the "you must call" block, not the verdict mention)
        elevation_pos = lower.find("what would great look like")
        propose_call_pos = lower.find("you must call `draft_approach`")
        assert propose_call_pos > 0, "Must have detailed draft_approach call instruction"
        assert elevation_pos < propose_call_pos, "Elevation prompt must appear before draft_approach call"
        # Must mention "fresh" as a valid source option
        assert "fresh" in lower, "Must mention 'fresh' as a valid source for new ideas"

    def test_evaluating_prior_answers_per_answer(self):
        """Changedoc section has per-answer independent analysis."""
        from massgen.system_prompt_sections import ChangedocSection

        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        # Must analyze each answer independently
        assert "each existing answer" in content.lower() or "each answer" in content.lower()
        # Must ask about unique strengths per answer
        assert "uniquely well" in content.lower() or "does well" in content.lower()


# ===========================================================================
# Part E: Previous Answer as Reference Material, Not Starting Point
# ===========================================================================


class TestRefinementReframing:
    """Previous answer is reference material, not a starting point.

    Agents should feel free to rebuild or discard sections of prior work
    rather than only patching/editing the existing deliverable.
    """

    def test_single_agent_decision_intro_reference_material(self):
        """Single-agent _decision_intro frames prior work as reference, not starting point."""
        prompt = _build_checklist_gated_decision(
            checklist_items=["E1 criterion", "E2 criterion"],
            score_current_work_only=True,
        )
        assert "reference material" in prompt.lower()

    def test_single_agent_decision_intro_rebuild_discard(self):
        """Single-agent path mentions freedom to rebuild or discard sections."""
        prompt = _build_checklist_gated_decision(
            checklist_items=["E1 criterion", "E2 criterion"],
            score_current_work_only=True,
        )
        lower = prompt.lower()
        assert "rebuild" in lower or "discard" in lower or "start fresh" in lower

    def test_multi_agent_decision_intro_reference_material(self):
        """Multi-agent _decision_intro frames prior answers as reference material."""
        prompt = _build_checklist_gated_decision(
            checklist_items=["E1 criterion", "E2 criterion"],
            score_current_work_only=False,
        )
        assert "reference material" in prompt.lower()

    def test_multi_agent_decision_intro_rebuild_discard(self):
        """Multi-agent path mentions freedom to rebuild or discard sections."""
        prompt = _build_checklist_gated_decision(
            checklist_items=["E1 criterion", "E2 criterion"],
            score_current_work_only=False,
        )
        lower = prompt.lower()
        assert "rebuild" in lower or "discard" in lower or "start fresh" in lower


class TestTaskPlanDetail:
    """Task plan entries carry detail from evaluator improvement specs."""

    def test_task_plan_carries_detail_field(self):
        """build_task_plan_from_evaluator_verdict includes detail when available."""
        from massgen.orchestrator import Orchestrator
        from massgen.subagent.models import RoundEvaluatorResult

        result = RoundEvaluatorResult(
            packet_text="test",
            status="success",
            verdict="iterate",
            scores={"E1": 4},
            improvements=[
                {
                    "criterion_id": "E1",
                    "plan": "Replace hero section",
                    "sources": ["agent1.1"],
                    "impact": "structural",
                    "verification": "Screenshot check",
                    "detail": ("The hero section should show the product in action " "using a live demo preview, not just static text."),
                },
            ],
            preserve=[],
        )

        task_plan = Orchestrator.build_task_plan_from_evaluator_verdict(result)
        improve_tasks = [t for t in task_plan if t["type"] == "improve"]

        assert len(improve_tasks) == 1
        assert "detail" in improve_tasks[0]
        assert "hero section should show the product" in improve_tasks[0]["detail"]

    def test_task_plan_detail_absent_when_not_provided(self):
        """detail field is empty string when not in improvement."""
        from massgen.orchestrator import Orchestrator
        from massgen.subagent.models import RoundEvaluatorResult

        result = RoundEvaluatorResult(
            packet_text="test",
            status="success",
            verdict="iterate",
            scores={"E1": 4},
            improvements=[
                {
                    "criterion_id": "E1",
                    "plan": "Replace hero section",
                    "sources": ["agent1.1"],
                    "impact": "structural",
                    "verification": "Screenshot check",
                },
            ],
            preserve=[],
        )

        task_plan = Orchestrator.build_task_plan_from_evaluator_verdict(result)
        improve_tasks = [t for t in task_plan if t["type"] == "improve"]
        assert improve_tasks[0].get("detail", "") == ""
