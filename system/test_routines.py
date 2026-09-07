#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".atlas" / "routines"))
import routine_engine as engine


class RoutineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.previous = os.environ.get("ATLAS_ROUTINES_DIR")
        os.environ["ATLAS_ROUTINES_DIR"] = self.tmp.name

    def tearDown(self):
        if self.previous is None:
            os.environ.pop("ATLAS_ROUTINES_DIR", None)
        else:
            os.environ["ATLAS_ROUTINES_DIR"] = self.previous
        self.tmp.cleanup()

    @staticmethod
    def hour():
        return {
            "id": "hora", "name": "Hora", "description": "Dice la hora",
            "thoughts": "Prueba determinista", "triggers": ["¿Qué hora es?"],
            "enabled": True,
            "steps": [
                {"type": "shell", "command": "printf 22:15", "capture": "HORA", "timeout_seconds": 2},
                {"type": "say", "text": "Son $HORA"},
            ],
        }

    def test_exact_normalized_match_and_execution(self):
        engine.upsert_routine(self.hour())
        result = engine.execute_phrase("Atlas, que hora es")
        self.assertTrue(result["ok"])
        self.assertEqual(result["spokenText"], "Son 22:15")
        self.assertTrue((Path(self.tmp.name) / "results" / f"{result['executionId']}.json").is_file())

    def test_no_fuzzy_match(self):
        engine.upsert_routine(self.hour())
        self.assertFalse(engine.execute_phrase("qué hora será")["matched"])

    def test_trigger_collision_and_dangerous_command(self):
        engine.upsert_routine(self.hour())
        other = self.hour() | {"id": "otra", "name": "Otra"}
        with self.assertRaises(engine.RoutineError):
            engine.upsert_routine(other)
        dangerous = self.hour() | {"id": "mala", "name": "Mala", "triggers": ["haz algo"],
                                  "steps": [{"type": "shell", "command": "rm -rf /tmp/x"}]}
        with self.assertRaises(engine.RoutineError):
            engine.upsert_routine(dangerous)

    def test_failure_stops_before_say(self):
        routine = self.hour() | {"steps": [
            {"type": "shell", "command": "exit 7", "timeout_seconds": 2},
            {"type": "say", "text": "No debe decirse"},
        ]}
        engine.upsert_routine(routine)
        result = engine.execute_phrase("qué hora es")
        self.assertFalse(result["ok"])
        self.assertEqual(result["spokenText"], "")
        self.assertEqual(len(result["steps"]), 1)

    def test_registry_is_json_inside_markdown(self):
        engine.upsert_routine(self.hour())
        text = engine.registry_path().read_text(encoding="utf-8")
        self.assertIn(engine.BEGIN, text)
        self.assertEqual(engine.load_registry()["routines"][0]["id"], "hora")


if __name__ == "__main__":
    unittest.main()
