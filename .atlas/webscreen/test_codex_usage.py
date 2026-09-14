import threading
import unittest
from unittest.mock import Mock, patch

from codex_usage import CodexUsageCache, normalize_usage


def sample():
    return {
        "fiveHour": {"usedPercent": 98, "resetAt": 1787955841000},
        "weekly": {"usedPercent": 15, "resetAt": 1788542641000},
        "updatedAt": 1787945065846,
        "planProfile": "plus",
        "available": True,
        "accountId": "private-account",
    }


class CodexUsageTests(unittest.TestCase):
    def test_stable_window_mapping_and_remaining(self):
        data = normalize_usage(sample())
        self.assertEqual(data["fiveHour"]["remainingPercent"], 2)
        self.assertEqual(data["weekly"]["remainingPercent"], 85)
        self.assertEqual(data["fiveHour"]["resetAt"], 1787955841000)

    def test_only_public_fields(self):
        data = normalize_usage(sample())
        self.assertEqual(set(data), {"fiveHour", "weekly", "updatedAt", "planProfile"})
        self.assertEqual(data["planProfile"], "plus")
        self.assertNotIn("private-account", str(data))

    def test_missing_is_not_zero(self):
        self.assertIsNone(normalize_usage({})["weekly"])
        data = sample()
        data["weekly"] = None
        data["fiveHour"]["usedPercent"] = 0
        self.assertIsNone(normalize_usage(data)["weekly"])
        self.assertEqual(normalize_usage(data)["fiveHour"]["remainingPercent"], 100)

    def test_pro_plan_uses_weekly_profile(self):
        data = sample()
        data["planProfile"] = "pro"
        data["fiveHour"] = None
        data["weekly"] = {"usedPercent": 2, "resetAt": 1789083660000}
        normalized = normalize_usage(data)
        self.assertEqual(normalized["planProfile"], "pro")
        self.assertIsNone(normalized["fiveHour"])
        self.assertEqual(normalized["weekly"]["remainingPercent"], 98)

    def test_accepts_standalone_broker_dto_without_leaking_extra_fields(self):
        normalized = normalize_usage({
            "fiveHour": None,
            "weekly": {"usedPercent": 59.04, "resetAt": 1789083660000},
            "updatedAt": 1787945065846,
            "planProfile": "pro",
            "available": True,
            "accountId": "private-account",
        })
        self.assertEqual(normalized["weekly"]["usedPercent"], 59.0)
        self.assertEqual(normalized["weekly"]["remainingPercent"], 41.0)
        self.assertEqual(normalized["planProfile"], "pro")
        self.assertNotIn("private-account", str(normalized))

    def test_invalid_values_and_retired_provider_shape(self):
        data = sample()
        for value in [float("nan"), float("inf"), True, "98", None]:
            data["fiveHour"]["usedPercent"] = value
            self.assertIsNone(normalize_usage(data)["fiveHour"])
        retired = {"updatedAt": 1787945065846, "providers": [{
            "provider": "openai",
            "windows": [{"label": "Week", "usedPercent": 15}],
        }]}
        self.assertEqual(normalize_usage(retired), normalize_usage({}))

    def test_no_secret_errors_and_last_good_retained(self):
        fetch = Mock(return_value=sample())
        cache = CodexUsageCache(fetch)
        cache._refresh()
        fetch.side_effect = RuntimeError("token=not-for-browser")
        cache._refresh()
        data = cache.snapshot()
        self.assertTrue(data["stale"])
        self.assertEqual(data["weekly"]["remainingPercent"], 85)
        self.assertNotIn("token=", str(data))

    def test_initial_failure_retries_quickly_instead_of_hiding_quota_for_a_minute(self):
        cache = CodexUsageCache(Mock(side_effect=RuntimeError("temporary")),
                                refresh_seconds=60, failure_retry_seconds=3)
        with patch("codex_usage.time.monotonic", return_value=100):
            cache._refresh()
        self.assertEqual(cache.next_refresh, 103)
        self.assertFalse(cache.data["fiveHour"] or cache.data["weekly"])

    def test_one_fetch_for_many_clients_nonblocking(self):
        ready, release = threading.Event(), threading.Event()
        def fetch():
            ready.set()
            release.wait(timeout=1)
            return sample()
        wrapped = Mock(side_effect=fetch)
        cache = CodexUsageCache(wrapped)
        try:
            self.assertTrue(cache.snapshot()["refreshing"])
            self.assertTrue(ready.wait(timeout=1))
            for _ in range(30):
                self.assertTrue(cache.snapshot()["refreshing"])
            self.assertEqual(wrapped.call_count, 1)
        finally:
            release.set()

    def test_expired_reading_marked_stale(self):
        cache = CodexUsageCache(lambda: sample())
        cache._refresh()
        with patch("codex_usage.time.time", return_value=1787956000):
            self.assertTrue(cache.snapshot()["stale"])


if __name__ == "__main__":
    unittest.main()
