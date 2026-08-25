import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "plugins/local-control/dashboard"


class PetCatalogTests(unittest.TestCase):
    def test_catalog_has_more_than_100_unique_reactions(self):
        data = json.loads((PLUGIN / "dist/pet-reactions.json").read_text())
        actions = data["actions"]
        self.assertGreater(len(actions), 100)
        self.assertEqual(len(actions), len({item["slug"] for item in actions}))
        self.assertGreater(len({item["line"] for item in actions}), 100)
        self.assertTrue(all(item["line"].strip() for item in actions))

    def test_every_reaction_has_a_vendored_svg(self):
        data = json.loads((PLUGIN / "dist/pet-reactions.json").read_text())
        assets = PLUGIN / "dist/assets/clawd-pets"
        missing = [item["slug"] for item in data["actions"] if not (assets / f"clawd-{item['slug']}.svg").is_file()]
        self.assertEqual(missing, [])
        self.assertTrue((assets / "LICENSE").is_file())

    def test_manifest_uses_bright_theme(self):
        manifest = json.loads((PLUGIN / "manifest.json").read_text())
        self.assertEqual(manifest["css"], "dist/style-bright.css")
        self.assertTrue((PLUGIN / manifest["css"]).is_file())


if __name__ == "__main__":
    unittest.main()
