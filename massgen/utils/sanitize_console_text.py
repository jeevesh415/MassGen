"""Console text sanitisation helpers."""

from __future__ import annotations

_CONSOLE_CHAR_FALLBACKS = {
    "→": "->",
    "❌": "[X]",
    "✅": "[OK]",
    "⚠️": "[!]",
    "⚠": "[!]",
}


def normalize_console_encoding(encoding: str | None) -> str | None:
    """Normalize a stream encoding for console safety checks."""
    if not encoding:
        return None
    normalized = encoding.strip().lower()
    if normalized in {"utf8", "utf-8", "utf_8", "utf-8-sig"}:
        return "utf-8"
    return normalized or None


def sanitize_console_text_for_encoding(text: str, encoding: str | None) -> str:
    """Return text that is safe to write to a console sink with *encoding*."""
    if not isinstance(text, str):
        text = str(text)

    normalized = normalize_console_encoding(encoding)
    if not text or normalized == "utf-8":
        return text

    if normalized:
        try:
            text.encode(normalized)
            return text
        except LookupError:
            normalized = None
        except UnicodeEncodeError:
            pass

    sanitized = text
    for source, replacement in _CONSOLE_CHAR_FALLBACKS.items():
        sanitized = sanitized.replace(source, replacement)

    target_encoding = normalized or "ascii"
    return sanitized.encode(target_encoding, errors="backslashreplace").decode(
        target_encoding,
    )
