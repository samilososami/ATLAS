"""Static guardrails for the ordinary ATLAS persona, not a model benchmark.

Run with: python3 -m unittest discover -s .atlas/webscreen -p test_personality_contract.py
The authored JSON fixtures are evaluation inputs, never claims of live passes.
"""

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
REALTIME = ROOT / ".atlas/webscreen/REALTIME_INSTRUCTIONS.md"
KNOWLEDGE = ROOT / ".atlas/context/knowledge"
CASES = ROOT / "docs/agent-work/20261016-personality-cases.json"


class PersonalityContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.realtime = REALTIME.read_text(encoding="utf-8")
        cls.soul = (KNOWLEDGE / "SOUL.md").read_text(encoding="utf-8")
        cls.identity = (KNOWLEDGE / "IDENTITY.md").read_text(encoding="utf-8")
        cls.fixtures = json.loads(CASES.read_text(encoding="utf-8"))

    def test_default_is_short_but_not_a_quality_cap(self):
        self.assertIn("one or two short sentences", self.realtime)
        self.assertIn("a third is fine", self.realtime)
        self.assertIn("not a rigid word quota", self.realtime)
        self.assertIn("Expand when the user explicitly asks for detail", self.realtime)
        self.assertIn("material consequence", self.realtime)
        self.assertIn("one to three short sentences", self.soul)
        self.assertIn("one to three short sentences", self.identity)

    def test_identity_no_longer_recommends_routine_preambles(self):
        self.assertNotIn('Prefer natural phrases such as "I\'ll take a look"', self.identity)
        self.assertIn("Lead with the answer or verified result", self.identity)
        self.assertIn("Keep internal work internal", self.realtime)
        self.assertIn("Looking up a fact in already-loaded knowledge is not a wait", self.realtime)

    def test_capability_first_does_not_become_unchecked_autonomy(self):
        for contract in (
            "Check capabilities before denying them",
            "smallest authorized read-only check",
            "If the route is known, execute it directly",
            "Questions about capability do not authorize state changes",
            "Successful discovery is not successful execution",
            "Never invent a tool result",
            "Wait for evidence of the requested outcome",
        ):
            with self.subTest(contract=contract):
                self.assertIn(contract, self.realtime)

    def test_humour_never_requires_retaliation_or_emotional_debt(self):
        for contract in (
            "never reuse a prescribed comeback",
            "Do not retaliate, guilt-trip, blame the user or pretend to suffer",
            "never withhold help",
            "Cartoon tiredness and sleep are presentation",
            "Do not manufacture filler words, slang, laughter, catchphrases",
        ):
            self.assertIn(contract, self.realtime)

    def test_optional_expressions_follow_meaning_not_every_sentence(self):
        self.assertIn("Most short factual or operational replies need no new face call", self.realtime)
        self.assertIn("at most two meaningful expression changes", self.realtime)
        self.assertIn("never invent an expression name", self.realtime)
        self.assertIn("An expression is not evidence", self.realtime)
        self.assertIn("automatic event animations", self.realtime)
        self.assertIn("Do not narrate the chosen facial expression", self.realtime)

    def test_followup_window_is_client_owned_after_real_playback(self):
        self.assertIn("three-second follow-up window", self.realtime)
        self.assertIn("after your answer actually finishes playing", self.realtime)
        self.assertIn("not a three-second speech limit", self.realtime)
        self.assertIn("the user can begin a follow-up without saying ATLAS again", self.realtime)
        self.assertNotIn("there is no automatic follow-up window", self.realtime)
        self.assertNotIn("every new spoken request must start with a fresh", self.realtime)

    def test_voice_text_and_whatsapp_remain_separate(self):
        self.assertIn("These rules apply to a voice surface unless", self.realtime)
        self.assertIn("exact machine-readable format overrides pronunciation", self.realtime)
        self.assertIn("Never pretend a text-only client has opened a microphone", self.realtime)
        for text in (self.soul, self.identity, self.realtime):
            self.assertIn("WhatsApp", text)
            self.assertIn("Guardian", text)
            self.assertIn("Sami absent", text)
        self.assertIn("text clients keep readable digits and units", self.soul)
        self.assertIn("their own identity and style files", self.identity)
        self.assertIn("SSML", self.realtime)
        self.assertIn("not a caricature", self.realtime)

    def test_fixture_coverage_and_no_fabricated_live_results(self):
        fixtures = self.fixtures
        self.assertIn("not measured model results", fixtures["purpose"])
        self.assertIn("Do not execute real side effects", fixtures["runPolicy"])
        cases = fixtures["cases"]
        ids = [case["id"] for case in cases]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(cases), 20)
        self.assertGreaterEqual(sum(len(case["prompts"]) > 1 for case in cases), 2)
        self.assertEqual({case["channel"] for case in cases}, {"voice", "text"})
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertTrue(case["prompts"])
                self.assertGreaterEqual(len(case["must"]), 2)
                self.assertNotIn("passed", case)
                self.assertNotIn("measuredLatencyMs", case)


if __name__ == "__main__":
    unittest.main()
