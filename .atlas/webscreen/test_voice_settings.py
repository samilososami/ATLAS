"""Offline settings/payload tests; never synthesize or contact a provider."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server as app


class VoiceSettingsTests(unittest.TestCase):
    def test_profiles_preserve_model_and_low_latency_options(self):
        natural = app.elevenlabs_voice_settings(True)
        legacy = app.elevenlabs_voice_settings(False)
        self.assertEqual(legacy, {"stability": .48, "similarity_boost": .78,
                                 "style": 0., "use_speaker_boost": False, "speed": 1.04})
        self.assertEqual(natural["speed"], 1.0)
        self.assertEqual(natural["stability"], .42)
        for settings in (natural, legacy):
            self.assertEqual(settings["style"], 0.)
            self.assertIs(settings["use_speaker_boost"], False)
            self.assertEqual(settings["similarity_boost"], .78)

    def test_request_keeps_text_and_streaming_without_tags_or_extra_provider_calls(self):
        text = "¿Lo probamos…? Son 48,3 grados. ¡Bien!"
        for enabled in (False, True):
            with self.subTest(enabled=enabled), \
                 patch.object(app, "get_tts_settings", return_value=("test-key", "test-voice")), \
                 patch.object(app, "get_webscreen_settings", return_value={"voiceNaturalness": enabled}), \
                 patch.object(app.urllib.request, "urlopen") as network:
                request = app.elevenlabs_speech_request(text)
            network.assert_not_called()
            payload = json.loads(request.data)
            self.assertEqual(payload["text"], text)
            self.assertEqual(payload["model_id"], app.ELEVENLABS_REALTIME_MODEL)
            self.assertEqual(payload["language_code"], "es")
            self.assertEqual(payload["voice_settings"], app.elevenlabs_voice_settings(enabled))
            self.assertIn("/stream?output_format=mp3_44100_128", request.full_url)
            self.assertNotIn("test-key", request.full_url)

    def test_setting_roundtrip_defaults_and_validation_are_strict(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(app, "RUNTIME_DIR", Path(directory)), \
             patch.object(app, "SETTINGS_FILE", Path(directory) / "settings.json"), \
             patch.object(app, "get_tts_settings", return_value=("", "existing-voice")):
            self.assertIs(app.get_webscreen_settings()["voiceNaturalness"], True)
            app.save_webscreen_settings(realtime_voice="marin", voice_naturalness=False)
            self.assertIs(app.get_webscreen_settings()["voiceNaturalness"], False)
            app.save_webscreen_settings(elevenlabs_voice_id="unchanged-test-voice")
            self.assertIs(app.get_webscreen_settings()["voiceNaturalness"], False)
            self.assertEqual(app.get_webscreen_settings()["realtimeVoice"], "marin")
            app.save_webscreen_settings(voice_naturalness=True)
            self.assertIs(app.get_webscreen_settings()["voiceNaturalness"], True)
            for invalid in ("false", 0, 1, [], {}):
                with self.assertRaises(ValueError):
                    app.save_webscreen_settings(voice_naturalness=invalid)


if __name__ == "__main__":
    unittest.main()
