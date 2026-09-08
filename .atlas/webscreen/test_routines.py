from __future__ import annotations

import os
import tempfile
import unittest

import server


class WebscreenRoutineTests(unittest.TestCase):
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
    def routine():
        return {
            "id": "saludo-local", "name": "Saludo local", "description": "Prueba",
            "thoughts": "No llama al modelo", "triggers": ["saluda localmente"],
            "enabled": True, "requires_model": False,
            "steps": [{"type": "say", "text": "Hola desde la rutina"}],
        }

    def test_manage_and_direct_execute_share_registry(self):
        saved = server.manage_realtime_routine({
            "action": "upsert", "routine": self.routine(),
        })
        self.assertTrue(saved["ok"])
        result = server.execute_routine_phrase("Atlas, saluda localmente")
        self.assertTrue(result["ok"])
        self.assertEqual(result["spokenText"], "Hola desde la rutina")
        self.assertFalse(result["requiresModel"])

        listed = server.manage_realtime_routine({"action": "list"})
        self.assertFalse(listed["routines"][0]["requires_model"])

    def test_failed_result_is_retrievable_without_reexecution(self):
        routine = self.routine() | {"id": "falla", "name": "Falla", "triggers": ["falla"],
                                    "steps": [{"type": "shell", "command": "exit 9"}]}
        server.manage_realtime_routine({"action": "upsert", "routine": __import__("json").dumps(routine)})
        failed = server.execute_routine_phrase("falla")
        result = server.manage_realtime_routine({
            "action": "last_result", "execution_id": failed["executionId"],
        })
        self.assertFalse(result["ok"])
        self.assertEqual(result["executionId"], failed["executionId"])


if __name__ == "__main__":
    unittest.main()
