"""Activity stream schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ActivityCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str = Field(min_length=1, max_length=30)
    label: str = Field(default="", max_length=60)
    text: str = Field(default="", max_length=2000)
    accent: str = Field(default="blue", max_length=20)
    timestamp: datetime | None = None


class ActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str = Field(max_length=30)
    label: str = Field(max_length=60)
    text: str
    accent: str = Field(max_length=20)
    timestamp: datetime