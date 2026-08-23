from __future__ import annotations

from html.parser import HTMLParser
from typing import Any


class _VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        text = " ".join(data.split())
        if text:
            self.parts.append(text)


def evaluate_static_page_audit(html: str, criteria: list[str]) -> dict[str, Any]:
    parser = _VisibleTextParser()
    parser.feed(html)
    visible = " ".join(parser.parts)
    haystack = f"{visible}\n{html}".lower()
    missing = [
        item for item in criteria if item.strip() and item.lower() not in haystack
    ]
    if missing:
        return {
            "ok": True,
            "verdict": "fail",
            "visible_text": visible[:4000],
            "summary": "Missing: " + "; ".join(missing),
            "layout_findings": missing,
        }
    return {
        "ok": True,
        "verdict": "pass",
        "visible_text": visible[:4000],
        "summary": "Static page audit passed all acceptance criteria.",
        "layout_findings": [],
    }
