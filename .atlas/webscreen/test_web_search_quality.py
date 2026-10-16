"""Offline contracts: no API calls, keys, account use or real searches."""
import io
import json
import stat
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch

import server as app


class WebSearchQualityTests(unittest.TestCase):
    def search(self, payload, **kwargs):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps(payload).encode()
        with patch.object(app, "tavily_search_settings", return_value=("private-test-key", "https://api.tavily.com")), \
             patch.object(app.urllib.request, "urlopen", return_value=response) as request:
            result = app.execute_tavily_search("fecha del evento", **kwargs)
        self.body = json.loads(request.call_args.args[0].data)
        return result

    def test_filters_are_forwarded_without_additional_inference_or_cost_escalation(self):
        self.search({"results": []}, include_domains=["EXAMPLE.ORG", "example.org"],
                    exclude_domains=["other.org"], start_date="2026-01-01", end_date="2026-10-13")
        self.assertEqual(self.body["include_domains"], ["example.org"])
        self.assertEqual(self.body["start_date"], "2026-01-01")
        self.assertEqual(self.body["search_depth"], "basic")
        for option in ("include_answer", "include_raw_content", "auto_parameters"):
            self.assertFalse(self.body[option])

    def test_rejects_ambiguous_or_invalid_filters_before_network(self):
        cases = [{"include_domains": "example.org"}, {"include_domains": ["https://example.org/path"]},
                 {"include_domains": ["example.org"], "exclude_domains": ["example.org"]},
                 {"start_date": "2026-02-30"}, {"start_date": "2026-10-13", "end_date": "2026-01-01"}]
        with patch.object(app.urllib.request, "urlopen") as request:
            for kwargs in cases:
                with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                    app.execute_tavily_search("test", **kwargs)
            request.assert_not_called()

    def test_sources_keep_attribution_dates_and_explicit_truncation(self):
        item = {"title": "Event", "url": "https://example.org/date", "content": "x" * 3000,
                "published_date": "2026-10-12", "score": 0.95}
        result = self.search({"results": [item, item, {"url": "javascript:alert(1)"}]})
        self.assertEqual(result["count"], 1)
        source = result["results"][0]
        self.assertEqual(source["sourceId"], "S1")
        self.assertEqual(source["published"], "2026-10-12")
        self.assertTrue(source["contentTruncated"])
        self.assertEqual(len(source["content"]), app.TAVILY_RESULT_CONTENT_CHARS)
        self.assertTrue(result["externalContent"]["untrusted"])
        self.assertIn("not necessarily the event date", result["evidenceGuidance"])

    def test_empty_results_encourage_refinement_without_claiming_no_answer_exists(self):
        result = self.search({"results": []})
        self.assertIn("refine", result["evidenceGuidance"])
        self.assertTrue(result["ok"])

    def test_bad_result_container_is_a_provider_error(self):
        with self.assertRaises(RuntimeError):
            self.search({"results": "bad"})

    def test_limits_results_to_requested_count(self):
        result = self.search({"results": [{"url": f"https://example.org/{i}"} for i in range(10)]}, max_results=2)
        self.assertEqual(result["count"], 2)

    def test_timeout_is_controlled_and_not_retried(self):
        with patch.object(app, "tavily_search_settings", return_value=("key", "https://api.tavily.com")), \
             patch.object(app.urllib.request, "urlopen", side_effect=TimeoutError) as request:
            with self.assertRaisesRegex(RuntimeError, "agotó"):
                app.execute_tavily_search("test")
            self.assertEqual(request.call_count, 1)

    def test_http_error_does_not_echo_provider_key(self):
        error = urllib.error.HTTPError("https://api.tavily.com", 401, "bad", {},
                                       io.BytesIO(b'{"detail":"private-test-key"}'))
        with patch.object(app, "tavily_search_settings", return_value=("private-test-key", "https://api.tavily.com")), \
             patch.object(app.urllib.request, "urlopen", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                app.execute_tavily_search("test")
            self.assertNotIn("private-test-key", str(raised.exception))

    def test_evidence_is_exact_private_and_linkable(self):
        result = self.search({"results": [{"url": "https://example.org", "content": "evidence"}]})
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "ATLAS_HOME", Path(directory)):
            app.save_tavily_evidence(result, "turn-123")
            path = Path(directory) / ".atlas/web-search-evidence" / (result["evidenceId"] + ".json")
            self.assertEqual(json.loads(path.read_text()), {"interactionId": "turn-123", "result": result})
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)

    def test_handler_passes_filters_and_links_private_evidence(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.read_json_payload = Mock(return_value={"interactionId": "turn-123", "args": {
            "query": "test", "include_domains": ["example.org"], "start_date": "2026-01-01"}})
        handler.send_json = Mock()
        handler.log_client = Mock(return_value={})
        result = {"evidenceId": "abc", "results": [], "durationMs": 1}
        with patch.object(app, "execute_tavily_search", return_value=result) as search, \
             patch.object(app, "save_tavily_evidence", side_effect=OSError), \
             patch.object(app, "append_realtime_event") as event:
            handler.handle_realtime_web_search()
        self.assertEqual(search.call_args.kwargs["include_domains"], ["example.org"])
        self.assertEqual(event.call_args.args[0]["requestId"], "abc")
        self.assertEqual(handler.send_json.call_args.args[0], 200)
        self.assertFalse(result["evidenceSaved"])


if __name__ == "__main__":
    unittest.main()
