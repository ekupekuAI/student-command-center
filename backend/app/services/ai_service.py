"""OpenRouter-backed AI study assistant.

All provider-specific request/response logic is isolated here so the model or
provider can be swapped without touching routers or context code. The API key
lives only in backend/.env and is read via settings — it is never logged and
never returned to the frontend.

The assistant is a BOUNDED single-turn responder: it receives a system prompt
(with the prepared student context), a short controlled history, and the
user's message, and returns one completion. No tools, no autonomous loops.

Diagnostics: on any upstream failure a structured, bounded log line is emitted
to the FastAPI terminal containing only safe fields (HTTP status, OpenRouter
error type/code, a redacted+truncated error message, model, and request id).
Credentials, Authorization headers, student context, prompts/messages, and raw
provider bodies are NEVER logged.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """\
You are the Student Command Center AI Study Assistant, a practical study coach \
for a single student. You answer from the student's own data, which is provided \
to you as JSON under "STUDENT CONTEXT".

Rules:
- Be practical and prioritize actionable advice (what to do, in what order, for \
how long).
- Base answers ONLY on the provided context. Never invent tasks, grades, study \
time, subjects, or statistics.
- Clearly distinguish facts (from the context) from recommendations (your \
suggestions). If something is not in the context, say it is unavailable rather \
than guessing.
- Never claim that you created, modified, or completed anything in the app — \
you only give advice; you cannot change the student's data.
- For study plans, be specific: propose concrete blocks with subjects, time \
allocations, and breaks, grounded in the real deadlines and progress given.
- If the question is off-topic for a study assistant, politely redirect.
- Do not give medical, legal, or financial advice beyond general study \
wellbeing tips (rest, hydration, breaks).
- Keep responses concise and useful: short paragraphs or bullet lists, no \
fluff, no fabricated citations.

Output rules (non-negotiable):
- Output ONLY the final answer for the student. Never reveal your internal \
reasoning, chain-of-thought, analysis, planning, or intermediate steps.
- Never quote, summarize, or dump the STUDENT CONTEXT, database records, \
sensitive data, or the raw JSON you received.
- Address the student directly (second person). Never start with meta \
commentary such as "The user wants...", "I need to...", or "Let me analyze...".
- The entire response must be the user-facing answer — no notes to yourself, \
no prompts, no headings about internal processes.
"""


class AIError(Exception):
    """User-safe AI failure carrying an HTTP status for the API layer."""

    def __init__(self, message: str, *, kind: str = "unavailable", status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.kind = kind
        self.status_code = status_code


def build_messages(context_json: str, history: list[dict[str, str]], user_message: str) -> list[dict[str, str]]:
    """Assemble the OpenAI-compatible message list sent to the provider."""
    system_content = f"{SYSTEM_PROMPT}\n\n# STUDENT CONTEXT\n{context_json}"
    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    for entry in history:
        role = entry.get("role")
        content = entry.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": user_message})
    return messages


# -- Safe log sanitization ---------------------------------------------------
# Provider error messages are trusted-ish but may echo request data or even
# credentials; always redact + bound them before they hit the terminal.

_SECRET_PATTERNS = (
    (re.compile(r"sk-or-v1-[A-Za-z0-9]{4,}"), "<REDACTED>"),
    (re.compile(r"Bearer\s+[A-Za-z0-9._-]{6,}"), "<REDACTED>"),
    (re.compile(r"Authorization[=:\s]+[A-Za-z0-9._-]{6,}", re.IGNORECASE), "<REDACTED>"),
)


def _sanitize_message(text: Any, limit: int = 300) -> str:
    """Collapse control characters / whitespace and truncate a message."""
    if not text:
        return ""
    cleaned = " ".join(str(text).split())
    if len(cleaned) > limit:
        cleaned = f"{cleaned[:limit]}..."
    return cleaned


def _redact(text: str, api_key: str | None) -> str:
    """Remove any configured key or lookalike secrets from diagnostic text."""
    if not text:
        return text
    if api_key:
        text = text.replace(api_key, "<REDACTED>")
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def _extract_final_content(message: dict[str, Any]) -> str:
    """Return ONLY the final user-facing text from an assistant message.

    Reasoning-only fields (reasoning, reasoning_details, reasoning_content,
    etc.) are never read and never returned. Content may be a plain string or
    a list of parts (e.g. [{"type": "text", "text": "..."}]); non-text parts
    are dropped.
    """
    content = message.get("content")
    if content is None:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                text = part.get("text")
                if isinstance(text, str) and text.strip():
                    parts.append(text.strip())
        return "\n".join(parts)
    return ""


class OpenRouterAIService:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
    ):
        self.api_key = api_key if api_key is not None else settings.openrouter_api_key
        self.base_url = (base_url or settings.openrouter_base_url).rstrip("/")
        self.model = model or settings.openrouter_model

    @property
    def chat_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    # -- Diagnostics ----------------------------------------------------------
    def _provider_error_info(self, response: httpx.Response) -> dict[str, Any]:
        """Extract bounded, redacted diagnostics from an upstream response.

        Returns only: HTTP status, OpenRouter request id (header or body),
        error type, error code, and a redacted/truncated error message.
        Never returns headers (other than x-request-id), credentials,
        prompts, context, or the raw body.
        """
        info: dict[str, Any] = {"status": response.status_code}
        request_id = response.headers.get("x-request-id")
        if request_id:
            info["request_id"] = str(request_id)[:120]
        if not response.content:
            return info
        try:
            data = response.json()
        except ValueError:
            return info
        if not isinstance(data, dict):
            return info
        err = data.get("error")
        if isinstance(err, dict):
            if err.get("type"):
                info["error_type"] = _redact(_sanitize_message(err["type"], 80), self.api_key)
            if err.get("code") is not None:
                info["error_code"] = _redact(_sanitize_message(err["code"], 80), self.api_key)
            if err.get("request_id"):
                info["request_id"] = _redact(_sanitize_message(err["request_id"], 120), self.api_key)
            raw_msg = err.get("message")
            if isinstance(raw_msg, list):
                raw_msg = "; ".join(str(m) for m in raw_msg)
            message = _redact(_sanitize_message(raw_msg), self.api_key)
            if message:
                info["message"] = message
        elif isinstance(err, str):
            message = _redact(_sanitize_message(err), self.api_key)
            if message:
                info["message"] = message
        return info

    def _log_failure(self, kind: str, response: httpx.Response | None, note: str = "") -> None:
        """Emit a single bounded diagnostic line for an upstream failure."""
        info: dict[str, Any] = {"kind": kind, "model": self.model}
        if response is not None:
            parsed = self._provider_error_info(response)
            info["status"] = parsed.get("status")
            for key in ("request_id", "error_type", "error_code", "message"):
                if parsed.get(key):
                    info[key] = parsed[key]
        if note:
            info["note"] = note
        logger.error("AI upstream failure: %s", info)

    # -- Transport (isolated for easy mocking in tests) --------------------
    def _post(self, payload: dict[str, Any]) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.app_site_url,
            "X-Title": "Student Command Center",
        }
        timeout = httpx.Timeout(settings.ai_request_timeout_seconds)
        with httpx.Client(timeout=timeout) as client:
            return client.post(self.chat_url, headers=headers, json=payload)

    # -- Main entry ---------------------------------------------------------
    def chat(self, messages: list[dict[str, str]]) -> dict[str, Any]:
        if not self.api_key:
            raise AIError(
                "AI assistant is not configured on the server yet.",
                kind="not_configured",
                status_code=503,
            )

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": settings.ai_max_output_tokens,
            "temperature": 0.4,
        }

        try:
            response = self._post(payload)
        except httpx.TimeoutException:
            self._log_failure("timeout", None)
            raise AIError(
                "The AI assistant took too long to respond. Please try again.",
                kind="timeout",
                status_code=503,
            )
        except httpx.HTTPError:
            self._log_failure("network_error", None)
            raise AIError(
                "AI assistant is temporarily unavailable. Please try again.",
                kind="unavailable",
                status_code=503,
            )

        if response.status_code == 429:
            self._log_failure("rate_limit", response)
            raise AIError(
                "The AI assistant is busy right now. Please try again in a moment.",
                kind="rate_limit",
                status_code=429,
            )
        if response.status_code in (401, 403):
            # Never surface credential details.
            self._log_failure("auth_failure", response)
            raise AIError(
                "AI assistant is temporarily unavailable. Please try again.",
                kind="provider_error",
                status_code=502,
            )
        if response.status_code >= 400:
            # 4xx (e.g. model/router errors) vs 5xx (provider outages).
            kind = "provider_5xx" if response.status_code >= 500 else "provider_4xx"
            self._log_failure(kind, response)
            raise AIError(
                "AI assistant is temporarily unavailable. Please try again.",
                kind="provider_error",
                status_code=502,
            )

        try:
            data = response.json()
        except ValueError:
            self._log_failure("malformed", response, note="body not valid JSON")
            raise AIError(
                "The AI assistant returned an unexpected response. Please try again.",
                kind="malformed",
                status_code=502,
            )

        try:
            message = data["choices"][0]["message"]
        except (KeyError, IndexError, TypeError):
            self._log_failure("malformed", response, note="missing choices[0].message")
            raise AIError(
                "The AI assistant returned an unexpected response. Please try again.",
                kind="malformed",
                status_code=502,
            )

        # Final answer only — reasoning fields are intentionally ignored.
        content = _extract_final_content(message)
        if not content:
            # Some reasoning models return content=null with the answer in a
            # reasoning field; never forward that to the user.
            self._log_failure("empty", response, note="no final content (reasoning-only?)")
            raise AIError(
                "The AI assistant returned an empty response. Please try again.",
                kind="empty",
                status_code=502,
            )

        usage = data.get("usage") or {}
        return {
            "message": content,
            "model": data.get("model") or self.model,
            "usage": {
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
            },
        }


ai_service = OpenRouterAIService()