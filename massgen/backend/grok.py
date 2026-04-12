"""xAI Grok backend implemented on the shared Responses API stack."""

from __future__ import annotations

import os
from typing import Any

from .response import ResponseBackend


class GrokBackend(ResponseBackend):
    """Grok backend using xAI's Responses-compatible API surface."""

    XAI_BASE_URL = "https://api.x.ai/v1"

    def __init__(self, api_key: str | None = None, **kwargs):
        self._reject_legacy_search_parameters(kwargs)
        kwargs.setdefault("base_url", self.XAI_BASE_URL)
        super().__init__(api_key=api_key, **kwargs)
        self.api_key = api_key or os.getenv("XAI_API_KEY")

    @staticmethod
    def _reject_legacy_search_parameters(kwargs: dict[str, Any]) -> None:
        extra_body = kwargs.get("extra_body")
        if isinstance(extra_body, dict) and "search_parameters" in extra_body:
            raise ValueError(
                "Grok no longer supports legacy extra_body.search_parameters. " "Use enable_web_search: true and/or enable_x_search: true instead.",
            )

    def get_provider_name(self) -> str:
        """Get the provider name."""
        return "Grok"

    def get_supported_builtin_tools(self) -> list[str]:
        """Get the builtin tools exposed through the Grok backend."""
        return ["web_search", "x_search", "code_execution"]
