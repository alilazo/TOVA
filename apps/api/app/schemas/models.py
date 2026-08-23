from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class DiscoveredModel(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(min_length=1)
    owned_by: str | None = None


class ModelConnectionTest(BaseModel):
    connected: bool
    latency_ms: int
    model: str | None = None
    error_code: str | None = None
    error: str | None = None


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    tool_call_id: str | None = None
    tool_calls: list[ToolCall] = []


class ToolDefinition(BaseModel):
    name: str = Field(min_length=1)
    description: str
    parameters: dict[str, Any]


class CompletionUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatCompletionRequest(BaseModel):
    model: str = Field(min_length=1)
    messages: list[ChatMessage] = Field(min_length=1)
    tools: list[ToolDefinition] = []
    temperature: float = Field(default=0.2, ge=0, le=2)
    max_tokens: int = Field(default=4096, gt=0)
    seed: int | None = None


class ChatCompletionResult(BaseModel):
    content: str | None = None
    tool_calls: list[ToolCall] = []
    finish_reason: str | None = None
    usage: CompletionUsage = CompletionUsage()
