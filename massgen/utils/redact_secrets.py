"""Helpers for redacting secrets from logs and structured events."""

from __future__ import annotations

import re
from typing import Any

REDACTION_PLACEHOLDER = "[REDACTED]"

_SENSITIVE_KEY_SUFFIXES = (
    "api_key",
    "access_token",
    "refresh_token",
    "token",
    "secret",
    "password",
    "private_key",
    "authorization",
)

_SENSITIVE_KEY_PATTERN = r'["\']?[A-Za-z][A-Za-z0-9_]*(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|AUTHORIZATION)["\']?'
_QUOTED_ASSIGNMENT_RE = re.compile(
    rf"(?P<prefix>{_SENSITIVE_KEY_PATTERN}\s*[:=]\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
    re.IGNORECASE,
)
_UNQUOTED_ASSIGNMENT_RE = re.compile(
    rf"(?P<prefix>{_SENSITIVE_KEY_PATTERN}\s*[:=]\s*)(?![\"'])(?P<value>[^\s,]+)",
    re.IGNORECASE,
)
_AUTHORIZATION_BEARER_RE = re.compile(
    r"(?i)(\bAuthorization\s*:\s*Bearer\s+)([^\s\"'`]+)",
)
_BARE_BEARER_RE = re.compile(r"(?i)(\bBearer\s+)([^\s\"'`]+)")
_INLINE_SECRET_PATTERNS = (
    re.compile(r"\bsk-proj-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{20,}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
)


def _normalize_key_name(key: str) -> str:
    """Normalize keys so snake_case / camelCase variants match consistently."""
    with_underscores = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
    return re.sub(r"[^a-z0-9]+", "_", with_underscores.lower()).strip("_")


def is_sensitive_key(key: str) -> bool:
    """Return True when a dictionary key likely contains secret material."""
    normalized = _normalize_key_name(key)
    return any(normalized == suffix or normalized.endswith(f"_{suffix}") for suffix in _SENSITIVE_KEY_SUFFIXES)


def redact_secrets_in_text(text: str) -> str:
    """Redact common secret formats from arbitrary text."""
    if not text:
        return text

    redacted = text
    redacted = _QUOTED_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group('prefix')}{match.group('quote')}{REDACTION_PLACEHOLDER}{match.group('quote')}",
        redacted,
    )
    redacted = _UNQUOTED_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group('prefix')}{REDACTION_PLACEHOLDER}",
        redacted,
    )
    redacted = _AUTHORIZATION_BEARER_RE.sub(
        rf"\1{REDACTION_PLACEHOLDER}",
        redacted,
    )
    redacted = _BARE_BEARER_RE.sub(
        rf"\1{REDACTION_PLACEHOLDER}",
        redacted,
    )
    for pattern in _INLINE_SECRET_PATTERNS:
        redacted = pattern.sub(REDACTION_PLACEHOLDER, redacted)
    return redacted


def redact_secrets(value: Any) -> Any:
    """Recursively redact secrets from nested data structures."""
    if isinstance(value, str):
        return redact_secrets_in_text(value)
    if isinstance(value, dict):
        redacted: dict[Any, Any] = {}
        for key, item in value.items():
            if isinstance(key, str) and is_sensitive_key(key):
                redacted[key] = REDACTION_PLACEHOLDER
            else:
                redacted[key] = redact_secrets(item)
        return redacted
    if isinstance(value, list):
        return [redact_secrets(item) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_secrets(item) for item in value)
    if isinstance(value, set):
        return {redact_secrets(item) for item in value}
    return value
