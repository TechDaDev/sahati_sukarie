import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts' / 'render_pdf.py'
SPEC = importlib.util.spec_from_file_location('sahati_pdf_renderer', SCRIPT)
RENDERER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(RENDERER)


class RendererFetchPolicyTests(unittest.TestCase):
    def test_rejects_network_urls_without_fetching(self):
        for url in ('http://127.0.0.1:9/pixel', 'https://example.invalid/font.ttf'):
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, 'blocked'):
                RENDERER.safe_fetch(url)

    def test_rejects_local_file_urls(self):
        with self.assertRaisesRegex(ValueError, 'blocked'):
            RENDERER.safe_fetch('file:///etc/passwd')

    def test_rejects_non_font_data_urls(self):
        with self.assertRaisesRegex(ValueError, 'blocked'):
            RENDERER.safe_fetch('data:text/html;base64,PHNjcmlwdD4=')

    def test_rejects_oversized_html(self):
        with self.assertRaisesRegex(ValueError, 'input limit'):
            RENDERER.render_html(b' ' * (2 * 1024 * 1024 + 1))


if __name__ == '__main__':
    unittest.main()
