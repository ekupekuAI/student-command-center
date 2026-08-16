"""AI assistant endpoints.

Thin layer: validate the request, build bounded student context, call the
OpenRouter-backed service, and return a clean application-level response.
No provider secrets, raw errors, or internal prompts ever reach the client.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import rate_limit_by_user
from app.core.security import CurrentUser
from app.database.session import get_db
from app.schemas.ai import ChatRequest, ChatResponse
from app.services.ai_service import AIError, ai_service, build_messages
from app.services.context_service import build_student_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# Per-user cost control: bounds how often the paid provider is called.
_ai_guard = Depends(rate_limit_by_user("ai", settings.ai_rate_limit_per_minute, 60))


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    _: None = _ai_guard,
) -> ChatResponse:
    # Controlled, size-bounded conversation history (recent messages only).
    history = [
        {"role": m.role, "content": m.content}
        for m in payload.history[-settings.ai_history_limit:]
    ]

    # Intent-aware, bounded student context (scoped to this user only).
    context = build_student_context(db, current_user.id, payload.message)
    context_json = json.dumps(context.data, default=str)

    messages = build_messages(context_json, history, payload.message)

    try:
        result = ai_service.chat(messages)
    except AIError as err:
        logger.info("AI chat failed (kind=%s, status=%s)", err.kind, err.status_code)
        raise HTTPException(status_code=err.status_code, detail=err.message)

    return ChatResponse(
        message=result["message"],
        context_used=context.labels,
        model=result["model"],
        usage=result.get("usage"),
    )