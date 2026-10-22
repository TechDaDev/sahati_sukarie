#!/opt/sahati-weasyprint/bin/python
"""Render one server-generated report. HTML arrives on stdin; PDF is stdout."""

import resource
import sys
from weasyprint import HTML, default_url_fetcher

MAX_FONT_DATA_URI_BYTES = 500 * 1024

def safe_fetch(url, *args, **kwargs):
    # The only fetchable resources are the three server-embedded Cairo fonts.
    if url.startswith('data:font/ttf;base64,') and len(url) <= MAX_FONT_DATA_URI_BYTES:
        return default_url_fetcher(url, *args, **kwargs)
    raise ValueError('External PDF renderer resource blocked')


def render_html(html: bytes) -> bytes:
    if len(html) > 2 * 1024 * 1024:
        raise ValueError('render input limit exceeded')
    page_styles = """
    <style>
    @page { size: A4; margin: 12mm 10mm 17mm;
      @bottom-center { content: "صحتي وسكري — صفحة " counter(page) " من " counter(pages);
        font-family: Cairo; font-size: 8px; color: #6B8299; }
    }
    </style>
    """.encode('utf-8')
    marker = b'</head>'
    if marker not in html:
        raise ValueError('invalid report HTML')
    html = html.replace(marker, page_styles + marker, 1)
    pdf = HTML(string=html.decode('utf-8'), url_fetcher=safe_fetch).write_pdf()
    if len(pdf) > 20 * 1024 * 1024 or not pdf.startswith(b'%PDF-'):
        raise ValueError('invalid renderer output')
    return pdf


def main() -> int:
    # Bound this worker independently of the application container's limits.
    resource.setrlimit(resource.RLIMIT_CPU, (12, 15))
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (20 * 1024 * 1024, 20 * 1024 * 1024))
    html = sys.stdin.buffer.read(2 * 1024 * 1024 + 1)
    if len(html) > 2 * 1024 * 1024:
        return 20
    try:
        sys.stdout.buffer.write(render_html(html))
        return 0
    except Exception:
        # Never emit HTML, report data, exception details, or document contents.
        return 22


if __name__ == '__main__':
    raise SystemExit(main())
