"""Prompt contract guards; these do not pretend to measure model compliance."""

import unittest

import server as app


class RealtimeInstructionTests(unittest.TestCase):
    def setUp(self):
        # Exercise the actual instruction loader used for session creation.
        self.instructions = app.read_realtime_instructions()

    def test_concise_default_also_applies_after_tools_and_inherited_history(self):
        self.assertIn("## Response length", self.instructions)
        self.assertIn("one or two short sentences", self.instructions)
        self.assertIn("Text-only clients", self.instructions)
        self.assertIn("earlier conversation history contains long replies", self.instructions)
        self.assertIn("including after tools, failures and social acknowledgements", self.instructions)

    def test_music_actions_are_explicitly_short_without_a_tutorial(self):
        self.assertIn("Spotify/music play, pause, stop, resume and volume", self.instructions)
        self.assertIn('"Pon música" followed by successful playback', self.instructions)
        self.assertIn('"para la música" followed by a successful pause', self.instructions)
        self.assertIn("one acknowledgement of one to five words", self.instructions)
        self.assertIn("Run them without a preamble", self.instructions)
        self.assertIn("Several internal tool calls do not turn an ordinary music request", self.instructions)

    def test_success_does_not_grow_an_unsolicited_offer_or_hypothetical_error(self):
        self.assertIn("Do not append offers", self.instructions)
        self.assertIn("speculative troubleshooting", self.instructions)
        self.assertIn('phrases such as "si quieres", "si no se oye"', self.instructions)
        self.assertIn("The user can ask for the next thing", self.instructions)

    def test_brevity_never_hides_failure_or_fakes_success(self):
        self.assertIn("Wait for evidence of the requested outcome", self.instructions)
        self.assertIn("Never assume playback was audible", self.instructions)
        self.assertIn('Never replace a failure, partial completion or uncertain result with "Hecho"', self.instructions)
        self.assertIn("material consequence", self.instructions)
        self.assertIn("Never invent a tool result", self.instructions)
        self.assertIn("real ambiguity", self.instructions)

    def test_detail_is_still_available_when_requested_and_progress_is_bounded(self):
        self.assertIn("Expand when the user explicitly asks for detail", self.instructions)
        self.assertIn("single short progress update", self.instructions)
        self.assertIn("Keep each update to one short sentence", self.instructions)


if __name__ == "__main__":
    unittest.main()
