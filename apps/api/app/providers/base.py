from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.schemas.models import (
    ChatCompletionRequest,
    ChatCompletionResult,
    DiscoveredModel,
    ModelConnectionTest,
)

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class ModelProvider(Protocol):
    """Vendor-neutral structured generation boundary."""

    async def list_models(self) -> list[DiscoveredModel]: ...

    async def test_connection(self, model: str | None = None) -> ModelConnectionTest: ...

    async def complete(self, request: ChatCompletionRequest) -> ChatCompletionResult: ...

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[StructuredOutput],
        model: str,
    ) -> StructuredOutput: ...
