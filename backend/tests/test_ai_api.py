"""API tests for POST /api/ai/chat (provider always mocked — no real calls)."""

from __future__ import annotations

from app.services.ai_service import AIError


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_chat_happy_path(client, auth_headers):
    response = client.post(
        "/api/ai/chat",
        json={"message": "What should I study today?"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["message"]
    assert body["model"] == "fake-model"
    assert isinstance(body["context_used"], list)
    assert body["usage"]["total_tokens"] == 18


def test_chat_with_history(client, auth_headers):
    response = client.post(
        "/api/ai/chat",
        json={
            "message": "And what about tomorrow?",
            "history": [
                {"role": "user", "content": "What should I study today?"},
                {"role": "assistant", "content": "Start with CS301."},
            ],
        },
        headers=auth_headers,
    )
    assert response.status_code == 200


def test_chat_rejects_empty_message(client, auth_headers):
    response = client.post("/api/ai/chat", json={"message": ""}, headers=auth_headers)
    assert response.status_code == 422


def test_chat_rejects_blank_message(client, auth_headers):
    response = client.post("/api/ai/chat", json={"message": "   "}, headers=auth_headers)
    assert response.status_code == 422


def test_chat_rejects_missing_message(client, auth_headers):
    response = client.post("/api/ai/chat", json={}, headers=auth_headers)
    assert response.status_code == 422


def test_chat_requires_auth(client):
    response = client.post("/api/ai/chat", json={"message": "What's due?"})
    assert response.status_code == 401


def test_chat_returns_clean_error_on_failure(client, auth_headers, monkeypatch):
    from app.services.ai_service import ai_service

    def failing_chat(messages):
        raise AIError(
            "AI assistant is temporarily unavailable. Please try again.",
            kind="provider_error",
            status_code=502,
        )

    monkeypatch.setattr(ai_service, "chat", failing_chat)
    response = client.post(
        "/api/ai/chat", json={"message": "What's due?"}, headers=auth_headers
    )
    assert response.status_code == 502
    assert response.json()["detail"] == "AI assistant is temporarily unavailable. Please try again."


def test_chat_error_never_exposes_internals(client, auth_headers, monkeypatch):
    import httpx

    from app.services.ai_service import OpenRouterAIService, ai_service

    # Exercise the REAL provider-mapping logic (not the fake) through the API,
    # simulating a provider response that tries to leak a credential.
    real = OpenRouterAIService(api_key="sk-or-v1-test")

    def leaking_post(payload):
        return httpx.Response(500, json={"error": {"message": "sk-or-v1-leak-123"}})

    monkeypatch.setattr(real, "_post", leaking_post)
    monkeypatch.setattr(ai_service, "chat", real.chat)

    response = client.post("/api/ai/chat", json={"message": "hi"}, headers=auth_headers)
    assert response.status_code == 502
    assert "sk-or-v1" not in response.text
    assert response.json()["detail"] == "AI assistant is temporarily unavailable. Please try again."


def test_chat_context_used_is_safe_labels_only(client, auth_headers):
    response = client.post(
        "/api/ai/chat",
        json={"message": "Make me a 2-hour study plan"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    allowed = {"subjects", "tasks", "study_sessions", "notes", "analytics"}
    assert isinstance(body["context_used"], list)
    assert all(label in allowed for label in body["context_used"])
    for label in body["context_used"]:
        assert "id" not in str(label)
        assert "password" not in str(label)
        assert "api" not in str(label)