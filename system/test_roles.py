"""Contracts for the declarative ATLAS role layer."""

from __future__ import annotations

import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
ROLES = ROOT / ".atlas" / "roles"


class RoleManifestTests(unittest.TestCase):
    def load(self, name: str) -> dict:
        return json.loads((ROLES / name / "role.json").read_text(encoding="utf-8"))

    def test_exactly_one_default_role_and_full_role_uses_canonical_context(self) -> None:
        manifests = [self.load("atlas-full"), self.load("profesores")]
        self.assertEqual(sum(bool(item["default"]) for item in manifests), 1)
        full = manifests[0]
        self.assertEqual(full["id"], "atlas-full")
        self.assertEqual(
            full["context"]["knowledgeManifest"],
            "../../context/knowledge/manifest.json",
        )
        self.assertTrue(full["context"]["includeConversation"])
        self.assertEqual(full["capabilities"]["defaultPolicy"], "allow")
        self.assertIn("shell", full["capabilities"]["allow"])

    def test_professors_role_is_strict_read_only_with_two_context_sources(self) -> None:
        role = self.load("profesores")
        self.assertEqual(role["capabilities"]["defaultPolicy"], "deny")
        self.assertEqual(role["capabilities"]["tools"], [])
        self.assertEqual(
            [source["path"] for source in role["context"]["sources"]],
            ["../../context/knowledge/IDENTITY.md", "PROFESORES.md"],
        )
        self.assertTrue(all(source["mode"] == "read-only" for source in role["context"]["sources"]))
        self.assertFalse(role["context"]["includeConversation"])
        self.assertFalse(role["context"]["includeKnowledgeManifest"])
        self.assertEqual(
            set(role["capabilities"]["allow"]),
            {"context.read", "runtime.current_datetime.read"},
        )
        for capability in ("shell", "filesystem.write", "network", "conversation.write"):
            self.assertIn(capability, role["capabilities"]["deny"])

    def test_professor_directory_and_schedule_are_complete_and_unambiguous(self) -> None:
        document = (ROLES / "profesores" / "PROFESORES.md").read_text(encoding="utf-8")
        directory = document.split("## Directorio docente", 1)[1].split("## Horario ficticio", 1)[0]
        schedule = document.split("## Horario ficticio", 1)[1].split(
            "Los grupos descartados", 1
        )[0]
        names = [
            line.split("|")[1].strip()
            for line in directory.splitlines()
            if line.startswith("|") and not line.startswith(("| Profesor", "|---"))
        ]
        self.assertEqual(len(names), 19)
        self.assertEqual(len(set(names)), 19)
        self.assertNotIn("Anna Palau Aleu", names)
        self.assertNotIn("Anna Palau Aleu", document)
        for name in names:
            self.assertIn(f"| {name} |", schedule)

        rows = [
            line for line in schedule.splitlines()
            if line.startswith("|") and not line.startswith(("| Profesor", "|---"))
        ]
        self.assertEqual(len(rows), 19)
        allowed_slots = {
            "08:00–09:00", "09:00–10:00", "10:00–11:00",
            "11:30–12:30", "12:30–13:30", "13:30–14:30",
        }
        for row in rows:
            cells = [cell.strip() for cell in row.strip("|").split("|")]
            self.assertEqual(len(cells), 6)
            for cell in cells[1:]:
                self.assertIn(cell.split(" · ", 1)[0], allowed_slots)

        for excluded in ("Quins Fums", "1.º BAT Científico", "3.º ESO D", "4D 24-25"):
            self.assertNotIn(excluded, schedule)
        for level in (
            "1.º ESO", "2.º ESO", "3.º ESO", "4.º ESO",
            "1.º BAT Humanístico-Social", "2.º BAT",
        ):
            self.assertRegex(schedule, re.escape(level))

        # A coherent demonstration cannot put two teachers with the same group
        # in the same time slot on the same day.
        occupied: set[tuple[int, str, str]] = set()
        for row in rows:
            cells = [cell.strip() for cell in row.strip("|").split("|")]
            for day, cell in enumerate(cells[1:]):
                slot, group, _room = cell.split(" · ")
                key = (day, slot, group)
                self.assertNotIn(key, occupied)
                occupied.add(key)

    def test_runtime_deploy_installs_the_declarative_role_layer(self) -> None:
        deploy = (ROOT / "system" / "deploy-runtime-update.sh").read_text(encoding="utf-8")
        for path in (
            ".atlas/roles/README.md",
            ".atlas/roles/role.schema.json",
            ".atlas/roles/atlas-full/role.json",
            ".atlas/roles/profesores/role.json",
            ".atlas/roles/profesores/PROFESORES.md",
        ):
            self.assertIn(path, deploy)


if __name__ == "__main__":
    unittest.main()
