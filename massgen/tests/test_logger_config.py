from __future__ import annotations

from pathlib import Path

import pytest


@pytest.mark.usefixtures("_isolate_test_logs")
def test_get_log_session_dir_respects_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import massgen.logger_config as logger_config

    custom_root = tmp_path / "custom_logs"
    monkeypatch.setenv("MASSGEN_LOG_BASE_DIR", str(custom_root))
    logger_config.reset_logging_session()

    log_dir = logger_config.get_log_session_dir()
    session_root = logger_config.get_log_session_root()

    assert session_root.parent == custom_root
    assert session_root.name.startswith("log_")
    assert log_dir == session_root / "turn_1" / "attempt_1"


@pytest.mark.usefixtures("_isolate_test_logs")
def test_set_log_base_session_dir_uses_env_override(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import massgen.logger_config as logger_config

    custom_root = tmp_path / "custom_logs"
    monkeypatch.setenv("MASSGEN_LOG_BASE_DIR", str(custom_root))
    logger_config.reset_logging_session()

    logger_config.set_log_base_session_dir("log_existing")
    log_dir = logger_config.get_log_session_dir()
    session_root = logger_config.get_log_session_root()

    assert session_root == custom_root / "log_existing"
    assert log_dir == custom_root / "log_existing" / "turn_1" / "attempt_1"


class _EncodingCheckedStream:
    def __init__(self, encoding: str) -> None:
        self.encoding = encoding
        self.parts: list[str] = []

    def write(self, text: str) -> None:
        text.encode(self.encoding)
        self.parts.append(text)

    def flush(self) -> None:
        return None


@pytest.mark.usefixtures("_isolate_test_logs")
def test_sanitize_console_text_preserves_utf8_content() -> None:
    from massgen.utils.sanitize_console_text import sanitize_console_text_for_encoding

    text = "❌ Retry (1/3): Choose best answer → then stop"
    assert sanitize_console_text_for_encoding(text, "utf-8") == text


@pytest.mark.usefixtures("_isolate_test_logs")
def test_console_safe_sink_downgrades_non_utf8_retry_text() -> None:
    import massgen.logger_config as logger_config

    stream = _EncodingCheckedStream("cp1252")
    sink = logger_config._ConsoleSafeSink(stream)

    sink.write("❌ Retry (1/3): Choose best answer → then stop\n⚠️ Warning\n")

    written = "".join(stream.parts)
    assert "[X] Retry (1/3): Choose best answer -> then stop" in written
    assert "[!] Warning" in written
    written.encode("cp1252")


@pytest.mark.usefixtures("_isolate_test_logs")
def test_log_stream_chunk_redacts_secrets() -> None:
    import massgen.logger_config as logger_config

    openai_key = "sk-proj-testsecret1234567890abcdefghijklmnopqrstuvwxyz"
    bearer_token = "AIzaSyTestSecret1234567890abcdefghijklmnop"
    messages: list[str] = []
    sink_id = logger_config.logger.add(
        lambda message: messages.append(str(message)),
        format="{message}",
    )

    try:
        logger_config.log_stream_chunk(
            "backend.codex",
            "content",
            f'OPENAI_API_KEY = "{openai_key}"\nAuthorization: Bearer {bearer_token}',
            agent_id="agent_1",
        )
    finally:
        logger_config.logger.remove(sink_id)

    written = "".join(messages)
    assert openai_key not in written
    assert bearer_token not in written
    assert 'OPENAI_API_KEY = "[REDACTED]"' in written
    assert "Authorization: Bearer [REDACTED]" in written
