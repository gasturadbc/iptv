import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "validate_playlists.py"
SPEC = importlib.util.spec_from_file_location("validate_playlists", MODULE_PATH)
validator = importlib.util.module_from_spec(SPEC)
import sys
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


class PlaylistParserTests(unittest.TestCase):
    def test_parses_names_categories_logos_and_urls(self):
        channels = validator.parse_playlist('#EXTM3U\n#EXTINF:-1 tvg-logo="https://img.test/logo.png" group-title="News",Canal 1\nhttps://stream.test/live.m3u8\n')
        self.assertEqual(len(channels), 1)
        self.assertEqual(channels[0]["name"], "Canal 1")
        self.assertEqual(channels[0]["category"], "News")
        self.assertEqual(channels[0]["logo"], "https://img.test/logo.png")
        self.assertEqual(channels[0]["url"], "https://stream.test/live.m3u8")

    def test_ignores_comments_and_duplicate_detection_can_use_url(self):
        channels = validator.parse_playlist('#EXTM3U\n#EXTVLCOPT:network-caching=1000\n#EXTINF:-1,Um\nhttps://stream.test/live\n')
        self.assertEqual([channel["url"] for channel in channels], ["https://stream.test/live"])

    def test_rejects_local_and_non_http_targets(self):
        self.assertFalse(validator.public_http_url("file:///etc/passwd"))
        self.assertFalse(validator.public_http_url("http://localhost/live"))

    def test_accepts_public_http_target(self):
        public_record = (None, None, None, None, ("8.8.8.8", 443))
        with patch.object(validator.socket, "getaddrinfo", return_value=[public_record]):
            self.assertTrue(validator.public_http_url("https://stream.test/live"))


if __name__ == "__main__":
    unittest.main()
