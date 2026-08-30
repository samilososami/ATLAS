"""Pronunciation regressions, without models, microphones or TTS requests."""
import unittest

import server as app


class VoicePronunciationTests(unittest.TestCase):
    def test_pronounceable_names_and_acronyms_stay_whole(self):
        self.assertEqual(
            app.prepare_voice_text("RAFAS API SOUL IDENTITY RAM LED"),
            "rafas api soul identity ram led",
        )

    def test_pronounceable_words_in_mixed_case(self):
        self.assertEqual(
            app.prepare_voice_text("Rafas usa una Api. Lee Soul e Identity."),
            "rafas usa una api. Lee soul e identity.",
        )

    def test_uppercase_does_not_trigger_automatic_spelling(self):
        self.assertEqual(
            app.prepare_voice_text("ATLAS NASA LINUX HOLA"),
            "ATLAS NASA LINUX HOLA",
        )

    def test_unpronounceable_initialisms_remain_spelled_out(self):
        self.assertEqual(
            app.prepare_voice_text("HDMI HTTPS DNS"),
            "h d m i h t t p s d n s",
        )
        self.assertEqual(app.prepare_voice_text("hdmi https dns"),
                         "h d m i h t t p s d n s")

    def test_filenames_keep_the_word_and_speak_the_extension(self):
        self.assertEqual(
            app.prepare_voice_text("IDENTITY.md y SOUL.md"),
            "identity punto eme de y soul punto eme de",
        )

    def test_existing_units_and_address_rules_are_preserved(self):
        self.assertEqual(app.prepare_voice_text("IP 192.168.1.142"),
                         "i pe ciento noventa y dos punto ciento sesenta y ocho "
                         "punto uno punto ciento cuarenta y dos")
        self.assertEqual(app.prepare_voice_text("GB RAM CPU USB"),
                         "gigabáits ram ce pe u u ese be")

    def test_normalization_is_idempotent(self):
        once = app.prepare_voice_text("RAFAS, API, SOUL.md, HDMI y DNS.")
        self.assertEqual(app.prepare_voice_text(once), once)

    def test_all_independent_voice_prompts_include_the_rule(self):
        for section in ("MAIN_PROMPT", "STARTER_PROMPT", "RESIDENT_STARTER_PROMPT"):
            prompt = app.instruction_section(section)
            for example in ("RAFAS", "API", "soul", "identity", "HDMI", "HTTPS", "DNS"):
                self.assertIn(example, prompt, (section, example))


if __name__ == "__main__":
    unittest.main()
