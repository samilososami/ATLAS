#!/usr/bin/env python3
from __future__ import annotations

import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".atlas" / "routines"))
import routine_engine as engine
import atlas_routines as cli


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
            "enabled": True, "requires_model": False,
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
        self.assertFalse(result["requiresModel"])
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

    def test_unresolved_say_variable_fails_instead_of_speaking_a_placeholder(self):
        routine = self.hour() | {"steps": [
            {"type": "shell", "command": "printf 22:15", "timeout_seconds": 2},
            {"type": "say", "text": "Son $HORA"},
        ]}
        engine.upsert_routine(routine)
        result = engine.execute_phrase("qué hora es")
        self.assertFalse(result["ok"])
        self.assertEqual(result["spokenText"], "")
        self.assertIn("variables sin resolver: HORA", result["error"])

    def test_registry_is_json_inside_markdown(self):
        engine.upsert_routine(self.hour())
        text = engine.registry_path().read_text(encoding="utf-8")
        self.assertIn(engine.BEGIN, text)
        self.assertEqual(engine.load_registry()["routines"][0]["id"], "hora")

    def test_legacy_phrase_object_is_migrated_without_becoming_literal_text(self):
        routine = self.hour() | {
            "triggers": ["{'type': 'phrase', 'value': 'qué hora es'}"],
        }
        saved = engine.upsert_routine(routine)
        self.assertEqual(saved["triggers"], ["qué hora es"])
        self.assertTrue(engine.execute_phrase("qué hora es")["ok"])

    def test_live_hour_shape_is_safe_before_and_direct_after_capture_repair(self):
        legacy = {
            "id": "hora_ahora", "name": "hora ahora",
            "description": "Responde con la hora actual al activarse por la frase exacta.",
            "thoughts": "Usar un comando simple para obtener la hora local.",
            "triggers": ["{'type': 'phrase', 'value': 'qué hora es'}"],
            "enabled": True,
            "steps": [
                {"type": "shell", "command": "printf 22:15", "timeout_seconds": 2},
                {"type": "say", "text": "Son las ${HORA}."},
            ],
        }
        migrated = engine.upsert_routine(legacy)
        self.assertEqual(migrated["triggers"], ["qué hora es"])
        self.assertFalse(migrated["requires_model"])
        self.assertFalse(engine.execute_phrase("qué hora es")["ok"])

        repaired = legacy | {
            "triggers": ["qué hora es"], "requires_model": False,
            "steps": [
                {"type": "shell", "command": "printf 22:15", "capture": "HORA",
                 "timeout_seconds": 2},
                {"type": "say", "text": "Son las ${HORA}."},
            ],
        }
        engine.upsert_routine(repaired, replace=True)
        result = engine.execute_phrase("Atlas, qué hora es")
        self.assertTrue(result["ok"])
        self.assertFalse(result["requiresModel"])
        self.assertEqual(result["spokenText"], "Son las 22:15.")

    def test_requires_model_is_a_strict_boolean_and_defaults_to_false(self):
        clean = engine.validate_routine({key: value for key, value in self.hour().items()
                                         if key != "requires_model"})
        self.assertFalse(clean["requires_model"])
        with self.assertRaises(engine.RoutineError):
            engine.validate_routine(self.hour() | {"requires_model": "false"})

    def test_list_is_numbered_and_compact_unless_expand_is_requested(self):
        engine.upsert_routine(self.hour())
        compact = io.StringIO()
        with mock.patch.object(sys, "argv", ["atlas-routines", "list"]), redirect_stdout(compact):
            self.assertEqual(cli.main(), 0)
        self.assertEqual(compact.getvalue(), "1. Hora · activa\n")

        implicit = io.StringIO()
        with mock.patch.object(sys, "argv", ["atlas-routines"]), redirect_stdout(implicit):
            self.assertEqual(cli.main(), 0)
        self.assertEqual(implicit.getvalue(), compact.getvalue())

        expanded = io.StringIO()
        with mock.patch.object(sys, "argv", ["atlas-routines", "list", "--expand"]), redirect_stdout(expanded):
            self.assertEqual(cli.main(), 0)
        detail = expanded.getvalue()
        self.assertTrue(detail.startswith("1. Hora · activa\n"))
        self.assertIn("   ID: hora\n", detail)
        self.assertIn("   Modelo: no\n", detail)
        self.assertIn("     2. [SAY] Son $HORA\n", detail)

    def test_cli_can_repair_a_legacy_id_without_creating_a_duplicate(self):
        legacy = self.hour() | {
            "id": "hora_ahora", "name": "hora ahora",
            "triggers": ["{'type': 'phrase', 'value': 'qué hora es'}"],
            "steps": [
                {"type": "shell", "command": "printf 22:15", "timeout_seconds": 2},
                {"type": "say", "text": "Son las ${HORA}."},
            ],
        }
        engine.upsert_routine(legacy)
        output = io.StringIO()
        arguments = [
            "atlas-routines", "create", "--id", "hora_ahora", "--name", "hora ahora",
            "--trigger", "qué hora es", "--command", "printf 22:15", "--capture", "HORA",
            "--say", "Son las ${HORA}.", "--no-requires-model", "--replace",
        ]
        with mock.patch.object(sys, "argv", arguments), redirect_stdout(output):
            self.assertEqual(cli.main(), 0)
        routines = engine.list_routines()
        self.assertEqual(len(routines), 1)
        self.assertEqual(routines[0]["id"], "hora_ahora")
        self.assertFalse(routines[0]["requires_model"])
        self.assertEqual(routines[0]["steps"][0]["capture"], "HORA")
        self.assertEqual(engine.execute_phrase("qué hora es")["spokenText"], "Son las 22:15.")


if __name__ == "__main__":
    unittest.main()
