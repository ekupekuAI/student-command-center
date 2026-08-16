"""Tests for the OpenRouter AI service (provider isolated, never networked)."""

from __future__ import annotations

import httpx
import pytest

from app.services.ai_service import AIError, OpenRouterAIService, build_messages


def test_build_messages_structure():
    messages = build_messages(
        '{"intent": "general"}',
        [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ],
        "what should I study?",
    )
    assert messages[0]["role"] == "system"
    assert "STUDENT CONTEXT" in messages[0]["content"]
    assert messages[1] == {"role": "user", "content": "hi"}
    assert messages[2] == {"role": "assistant", "content": "hello"}
    assert messages[3] == {"role": "user", "content": "what should I study?"}


def test_build_messages_filters_invalid_roles():
    messages = build_messages(
        "{}",
        [
            {"role": "system", "content": "ignored"},
            {"role": "user", "content": ""},
            {"role": "user", "content": "keep me"},
        ],
        "msg",
    )
    assert messages[1] == {"role": "user", "content": "keep me"}
    assert all(m["role"] in ("system", "user", "assistant") for m in messages)


def test_chat_success(monkeypatch):
    from app.core.config import settings

    service = OpenRouterAIService(api_key="test-key")

    def fake_post(payload):
        assert payload["model"] == settings.openrouter_model
        assert payload["max_tokens"] > 0
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "Great answer."}}],
                "model": "some/model",
                "usage": {"prompt_tokens": 4, "completion_tokens": 2, "total_tokens": 6},
            },
        )

    monkeypatch.setattr(service, "_post", fake_post)
    result = service.chat([{"role": "user", "content": "hi"}])
    assert result["message"] == "Great answer."
    assert result["model"] == "some/model"
    assert result["usage"]["total_tokens"] == 6


def test_chat_missing_api_key():
    service = OpenRouterAIService(api_key="")
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 503
    assert exc.value.kind == "not_configured"


def test_chat_timeout(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")

    def timeout_post(payload):
        raise httpx.TimeoutException("timed out")

    monkeypatch.setattr(service, "_post", timeout_post)
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 503
    assert exc.value.kind == "timeout"


def test_chat_rate_limit(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(service, "_post", lambda payload: httpx.Response(429))
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 429
    assert exc.value.kind == "rate_limit"


def test_chat_invalid_key_hides_credentials(monkeypatch):
    service = OpenRouterAIService(api_key="sk-secret")
    monkeypatch.setattr(service, "_post", lambda payload: httpx.Response(401))
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert "secret" not in exc.value.message
    assert exc.value.status_code == 502


def test_chat_malformed_response(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")

    def malformed_post(payload):
        return httpx.Response(200, json={"unexpected": True})

    monkeypatch.setattr(service, "_post", malformed_post)
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert exc.value.kind == "malformed"


def test_chat_non_json_response(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(200, text="<html>oops</html>"),
    )
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502


def test_diagnostics_distinguish_provider_5xx(monkeypatch, caplog):
    import logging

    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(
            500,
            json={
                "error": {
                    "type": "temporary_error",
                    "code": "upstream_unavailable",
                    "message": "provider exploded",
                    "request_id": "req_abc123",
                }
            },
        ),
    )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert exc.value.kind == "provider_error"
    assert "provider_5xx" in caplog.text
    assert "temporary_error" in caplog.text
    assert "upstream_unavailable" in caplog.text
    assert "provider exploded" in caplog.text
    assert "req_abc123" in caplog.text
    assert "test-key" not in caplog.text
    assert "hi" not in caplog.text


def test_diagnostics_distinguish_model_router_error(monkeypatch, caplog):
    import logging

    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(
            400,
            json={"error": {"type": "invalid_request_error", "message": 'The model "openrouter/auto" was not found'}},
        ),
    )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert "provider_4xx" in caplog.text
    assert "invalid_request_error" in caplog.text
    assert "model" in caplog.text
    assert "openrouter/auto" in caplog.text


def test_diagnostics_auth_failure_and_no_secret_leak(monkeypatch, caplog):
    import logging

    service = OpenRouterAIService(api_key="sk-or-v1-supersecretkey")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(
            401,
            json={
                "error": {
                    "type": "authentication_error",
                    "message": "Invalid API key sk-or-v1-supersecretkey echoed back",
                }
            },
        ),
    )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert "auth_failure" in caplog.text
    assert "authentication_error" in caplog.text
    assert "sk-or-v1-supersecretkey" not in caplog.text
    assert "<REDACTED>" in caplog.text


def test_diagnostics_malformed_and_no_body_dump(monkeypatch, caplog):
    import logging

    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(200, text="<html>not json</html>"),
    )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert "malformed" in caplog.text
    assert "<html>" not in caplog.text


def test_diagnostics_rate_limit_and_timeout(monkeypatch, caplog):
    import logging

    service = OpenRouterAIService(api_key="test-key")
    monkeypatch.setattr(
        service,
        "_post",
        lambda payload: httpx.Response(429, json={"error": {"type": "rate_limit_error"}}),
    )
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 429
    assert "rate_limit" in caplog.text

    def timeout_post(payload):
        raise httpx.TimeoutException("boom")

    monkeypatch.setattr(service, "_post", timeout_post)
    with caplog.at_level(logging.ERROR, logger="app.services.ai_service"):
        with pytest.raises(AIError) as exc:
            service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 503
    assert exc.value.kind == "timeout"
    assert "timeout" in caplog.text


def test_chat_never_leaks_reasoning_fields(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")

    def fake_post(payload):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "Final answer for you.",
                            "reasoning": "The user wants a 2-hour study plan. I need to analyze...",
                            "reasoning_details": [
                                {"detail": "internal step 1"},
                                {"detail": "internal step 2"},
                            ],
                        }
                    }
                ],
                "model": "reasoning/model",
                "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
            },
        )

    monkeypatch.setattr(service, "_post", fake_post)
    result = service.chat([{"role": "user", "content": "hi"}])
    assert result["message"] == "Final answer for you."
    assert "reasoning" not in result
    assert "reasoning_details" not in result
    assert "reasoning_content" not in result
    assert "analyze" not in result["message"]


def test_chat_handles_content_part_list(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")

    def fake_post(payload):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"type": "text", "text": "Study CS301 first."},
                                {"type": "thinking", "text": "internal step"},
                                {"type": "text", "text": "Then take a break."},
                            ]
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(service, "_post", fake_post)
    result = service.chat([{"role": "user", "content": "hi"}])
    assert result["message"] == "Study CS301 first.\nThen take a break."
    assert "internal" not in result["message"]


def test_chat_reasoning_only_is_empty(monkeypatch):
    service = OpenRouterAIService(api_key="test-key")

    def fake_post(payload):
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": None, "reasoning": "lots of internal thinking"}}
                ]
            },
        )

    monkeypatch.setattr(service, "_post", fake_post)
    with pytest.raises(AIError) as exc:
        service.chat([{"role": "user", "content": "hi"}])
    assert exc.value.status_code == 502
    assert exc.value.kind == "empty"


def test_system_prompt_forbids_reasoning_and_dump():
    from app.services.ai_service import SYSTEM_PROMPT

    text = SYSTEM_PROMPT.lower()
    assert "chain-of-thought" in text or "internal reasoning" in text
    assert "only the final answer" in text
    assert "dump" in text
    assert "never" in text