"""Tests for convergence and ambition/craft mechanisms.

Tests cover:
- Rationale preservation rules in changedoc subsequent round prompt
- T4 ambition/craft definition (depth over breadth, synthesis with improvement counts)
- Fresh approach enhancements (FEWER decisions restraint)
- Substantiveness classification in changedoc analysis
"""

from massgen.system_prompt_sections import (
    _CHECKLIST_ITEM_CATEGORIES_CHANGEDOC,
    _CHECKLIST_ITEMS_CHANGEDOC,
    ChangedocSection,
    EvaluationSection,
    _build_changedoc_checklist_analysis,
    _build_checklist_analysis,
    _build_checklist_gated_decision,
    _build_checklist_scored_decision,
)

# ---------------------------------------------------------------------------
# Rationale Preservation Rules
# ---------------------------------------------------------------------------


class TestRationalePreservation:
    """Tests for rationale preservation rules in changedoc subsequent round prompt."""

    def test_subsequent_round_has_rationale_preservation_rule(self):
        """Subsequent-round changedoc prompt must contain rationale preservation rules."""
        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        assert "Rationale Preservation Rule" in content

    def test_subsequent_round_mentions_synthesis_note(self):
        """Subsequent-round prompt instructs using Synthesis Note for meta-reasoning."""
        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        assert "Synthesis Note" in content

    def test_subsequent_round_forbids_meta_justification(self):
        """Subsequent-round prompt explicitly forbids replacing Why with meta-justification."""
        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        assert "FORBIDDEN" in content
        assert "this was the best prior answer" in content

    def test_first_round_no_rationale_preservation(self):
        """First-round prompt does not contain rationale preservation rules (not needed)."""
        section = ChangedocSection(has_prior_answers=False)
        content = section.build_content()
        assert "Synthesis Note" not in content
        assert "Rationale Preservation" not in content

    def test_subsequent_round_template_shows_synthesis_note(self):
        """Template example in subsequent round includes Synthesis Note field."""
        section = ChangedocSection(has_prior_answers=True)
        content = section.build_content()
        # Both inherited and modified templates should have Synthesis Note
        assert content.count("**Synthesis Note:**") >= 2


# ---------------------------------------------------------------------------
# T4 Ambition/Craft Definition
# ---------------------------------------------------------------------------


class TestE4StretchDefinition:
    """Tests for E4 stretch checklist item covering polish/craft."""

    def test_e4_covers_intentional_craft(self):
        """E4 item must address intentional craft beyond correctness."""
        e4_item = _CHECKLIST_ITEMS_CHANGEDOC[3]
        assert "craft" in e4_item.lower() or "deliberate" in e4_item.lower()

    def test_e4_mentions_quality_recognition(self):
        """E4 item must mention recognizable quality."""
        e4_item = _CHECKLIST_ITEMS_CHANGEDOC[3]
        assert "quality" in e4_item.lower() or "knowledgeable" in e4_item.lower()

    def test_changedoc_checklist_has_4_items(self):
        """Changedoc checklist must have exactly 4 items."""
        assert len(_CHECKLIST_ITEMS_CHANGEDOC) == 4

    def test_e4_is_standard_category(self):
        """E4 is tagged as standard — must-pass criterion."""
        assert _CHECKLIST_ITEM_CATEGORIES_CHANGEDOC["E4"] == "standard"


# ---------------------------------------------------------------------------
# Fresh Approach Enhancement
# ---------------------------------------------------------------------------


class TestFreshApproach:
    """Tests for fresh approach enhancements."""

    def test_sequential_r2_has_variation_guidance(self):
        """Sequential sensitivity Round 2 (CONVERGENCE phase) should mention variation."""
        section = EvaluationSection(
            voting_sensitivity="sequential",
            round_number=2,
        )
        content = section.build_content()
        lower = content.lower()
        # R2 should encourage fresh approaches or variation
        assert "vari" in lower or "fresh" in lower or "different" in lower or "diverg" in lower


# ---------------------------------------------------------------------------
# Change 1: Adversarial Critique Framing
# ---------------------------------------------------------------------------


class TestDiagnosticAnalysis:
    """Tests for GEPA-style diagnostic analysis framework."""

    def test_generic_analysis_has_failure_patterns(self):
        """Generic checklist analysis must have Failure Patterns section."""
        analysis = _build_checklist_analysis()
        assert "Failure Patterns" in analysis

    def test_generic_analysis_has_success_patterns(self):
        """Generic checklist analysis must have Success Patterns section."""
        analysis = _build_checklist_analysis()
        assert "Success Patterns" in analysis

    def test_generic_analysis_has_root_causes(self):
        """Generic checklist analysis must have Root Causes section."""
        analysis = _build_checklist_analysis()
        assert "Root Causes" in analysis

    def test_changedoc_analysis_has_failure_patterns(self):
        """Changedoc analysis must have Failure Patterns section."""
        analysis = _build_changedoc_checklist_analysis()
        assert "Failure Patterns" in analysis

    def test_changedoc_analysis_has_decision_audit(self):
        """Changedoc analysis must still include Decision Audit."""
        analysis = _build_changedoc_checklist_analysis()
        assert "Decision Audit" in analysis

    def test_generic_analysis_no_assess_quality(self):
        """Generic analysis must not use the old 'assess quality' framing."""
        analysis = _build_checklist_analysis()
        assert "Is it something you would be proud to deliver" not in analysis

    def test_changedoc_analysis_no_assess_quality(self):
        """Changedoc analysis must not use the old 'assess quality' framing."""
        analysis = _build_changedoc_checklist_analysis()
        assert "Is it something you would be proud to deliver" not in analysis


# ---------------------------------------------------------------------------
# Change 2: Score Calibration Anchors
# ---------------------------------------------------------------------------


class TestScoreCalibration:
    """Tests for score calibration anchors in decision sections."""

    def test_gated_decision_has_calibration_anchors(self):
        """Gated decision must include score calibration anchor ranges."""
        decision = _build_checklist_gated_decision(_CHECKLIST_ITEMS_CHANGEDOC)
        assert "9-10" in decision
        assert "7-8" in decision
        assert "5-6" in decision
        assert "3-4" in decision
        assert "1-2" in decision

    def test_gated_decision_has_consistency_rule(self):
        """Gated decision must have calibration consistency rule."""
        decision = _build_checklist_gated_decision(_CHECKLIST_ITEMS_CHANGEDOC)
        assert "MUST be consistent with" in decision

    def test_gated_decision_has_analysis_score_consistency(self):
        """Gated decision must include analysis-vs-score consistency check."""
        decision = _build_checklist_gated_decision(_CHECKLIST_ITEMS_CHANGEDOC)
        lower = decision.lower()
        assert "diagnostic report" in lower
        assert "scores are inflated" in lower

    def test_gated_decision_prioritizes_output_over_changedoc(self):
        """Gated decision should state that output quality outranks docs quality."""
        decision = _build_checklist_gated_decision(_CHECKLIST_ITEMS_CHANGEDOC)
        assert "Output quality takes precedence over documentation quality" in decision
        assert "missing/weak changedoc alone" in decision

    def test_scored_decision_has_calibration_anchors(self):
        """Scored decision must also include calibration anchor text."""
        decision = _build_checklist_scored_decision(
            threshold=5,
            remaining=3,
            total=5,
            checklist_items=_CHECKLIST_ITEMS_CHANGEDOC,
        )
        assert "9-10" in decision
        assert "7-8" in decision


# ---------------------------------------------------------------------------
# Change 3: Hardened Gap Analysis
# ---------------------------------------------------------------------------


class TestDiagnosticGoalAlignment:
    """Tests for GEPA-style goal alignment and cross-answer synthesis."""

    def test_generic_has_goal_alignment(self):
        """Generic analysis must have Goal Alignment section."""
        analysis = _build_checklist_analysis()
        assert "Goal Alignment" in analysis

    def test_generic_goal_alignment_references_original_request(self):
        """Goal alignment must score against the original request."""
        analysis = _build_checklist_analysis()
        assert "original request" in analysis or "original message" in analysis

    def test_changedoc_has_goal_alignment(self):
        """Changedoc analysis must have Goal Alignment section."""
        analysis = _build_changedoc_checklist_analysis()
        assert "Goal Alignment" in analysis

    def test_generic_has_cross_answer_synthesis(self):
        """Generic analysis must have Cross-Answer Synthesis section."""
        analysis = _build_checklist_analysis()
        assert "Cross-Answer Synthesis" in analysis


# ---------------------------------------------------------------------------
# Change 5: Recalibration Between Ideal and Gap
# ---------------------------------------------------------------------------


class TestRecalibration:
    """Tests for recalibration text in goal alignment section."""

    def test_generic_analysis_has_recalibration(self):
        """Generic analysis must have recalibration text in goal alignment."""
        analysis = _build_checklist_analysis()
        assert "score for that criterion must be low" in analysis

    def test_changedoc_analysis_has_recalibration(self):
        """Changedoc analysis must have recalibration text in goal alignment."""
        analysis = _build_changedoc_checklist_analysis()
        assert "distance in mind" in analysis


# ---------------------------------------------------------------------------
# Novelty Subagent Type
# ---------------------------------------------------------------------------


class TestNoveltySubagentType:
    """Tests for the novelty subagent type definition."""

    def test_novelty_subagent_md_exists(self):
        """massgen/subagent_types/novelty/SUBAGENT.md must exist."""
        from pathlib import Path

        subagent_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        assert subagent_md.exists(), f"Expected {subagent_md} to exist"

    def test_novelty_subagent_has_valid_yaml_frontmatter(self):
        """SUBAGENT.md must have valid YAML frontmatter with required fields."""
        from pathlib import Path

        import yaml

        subagent_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = subagent_md.read_text()

        # Must start with YAML frontmatter
        assert content.startswith("---"), "SUBAGENT.md must start with YAML frontmatter"
        end = content.index("---", 3)
        frontmatter = yaml.safe_load(content[3:end])

        assert frontmatter["name"] == "novelty"
        assert "description" in frontmatter
        assert "expected_input" in frontmatter

    def test_novelty_subagent_instructions_contain_key_elements(self):
        """SUBAGENT.md body must contain key instruction elements."""
        from pathlib import Path

        subagent_md = Path(__file__).parent.parent / "subagent_types" / "novelty" / "SUBAGENT.md"
        content = subagent_md.read_text().lower()

        # Must instruct transformative alternatives, not incremental
        assert "transformative" in content
        assert "incremental" in content
        # Must mention breaking plateaus or stalling
        assert "plateau" in content or "stall" in content or "anchor" in content
        # Must propose multiple directions
        assert "direction" in content or "alternative" in content
        # Must explain WHY, not just WHAT
        assert "why" in content
