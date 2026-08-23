import json
import time
from enum import StrEnum
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.schemas.models import (
    ChatCompletionRequest,
    ChatCompletionResult,
    CompletionUsage,
    DiscoveredModel,
    ModelConnectionTest,
    ToolCall,
)

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class ProviderErrorCode(StrEnum):
    DISCONNECTED = "disconnected"
    AUTHENTICATION_FAILED = "authentication_failed"
    MODEL_UNAVAILABLE = "model_unavailable"
    MODEL_NOT_LOADED = "model_not_loaded"
    TIMEOUT = "timeout"
    CONTEXT_EXCEEDED = "context_exceeded"
    MALFORMED_RESPONSE = "malformed_response"
    INVALID_STRUCTURED_OUTPUT = "invalid_structured_output"
    GENERATION_CANCELLED = "generation_cancelled"


class ProviderError(RuntimeError):
    def __init__(self, code: ProviderErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


class OpenAICompatibleProvider:
    def __init__(
        self,
        *,
        base_url: str,
        api_token: str | None = None,
        timeout: float = 60,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self._token = api_token
        self._timeout = timeout
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}"} if self._token else {}

    def _redact(self, value: str) -> str:
        return value.replace(self._token, "[REDACTED]") if self._token else value

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            response = await self._client.request(
                method,
                f"{self.base_url}{path}",
                headers=self._headers(),
                timeout=self._timeout,
                **kwargs,
            )
        except httpx.TimeoutException as exc:
            raise ProviderError(ProviderErrorCode.TIMEOUT, "Model request timed out") from exc
        except httpx.RequestError as exc:
            raise ProviderError(
                ProviderErrorCode.DISCONNECTED,
                self._redact(f"Could not connect to model server: {exc}"),
            ) from exc
        if response.status_code == 401:
            raise ProviderError(
                ProviderErrorCode.AUTHENTICATION_FAILED,
                self._redact(response.text or "Authentication failed"),
            )
        if response.status_code == 404:
            raise ProviderError(ProviderErrorCode.MODEL_UNAVAILABLE, "Model unavailable")
        if response.status_code == 408:
            raise ProviderError(ProviderErrorCode.TIMEOUT, "Model request timed out")
        if response.status_code >= 400:
            detail = self._redact(response.text)
            lowered = detail.lower()
            if "terminated" in lowered or "prediction-error" in lowered:
                raise ProviderError(
                    ProviderErrorCode.GENERATION_CANCELLED,
                    "LM Studio aborted generation (model may have unloaded). "
                    "Check VRAM/context length, keep Local Server running, and retry.",
                )
            code = (
                ProviderErrorCode.CONTEXT_EXCEEDED
                if "context" in lowered
                else ProviderErrorCode.MODEL_NOT_LOADED
                if "load" in lowered
                else ProviderErrorCode.MALFORMED_RESPONSE
            )
            raise ProviderError(code, detail[:500] or code.value)
        return response

    async def list_models(self) -> list[DiscoveredModel]:
        response = await self._request("GET", "/models")
        try:
            rows = response.json()["data"]
            return [DiscoveredModel.model_validate(row) for row in rows]
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise ProviderError(
                ProviderErrorCode.MALFORMED_RESPONSE, "Malformed models response"
            ) from exc

    async def test_connection(self, model: str | None = None) -> ModelConnectionTest:
        started = time.perf_counter()
        try:
            models = await self.list_models()
            selected = model or (models[0].id if models else None)
            if model is not None and all(item.id != model for item in models):
                raise ProviderError(ProviderErrorCode.MODEL_UNAVAILABLE, "Model unavailable")
            return ModelConnectionTest(
                connected=True,
                latency_ms=round((time.perf_counter() - started) * 1000),
                model=selected,
            )
        except ProviderError as exc:
            return ModelConnectionTest(
                connected=False,
                latency_ms=round((time.perf_counter() - started) * 1000),
                model=model,
                error_code=exc.code.value,
                error=str(exc),
            )

    async def complete(self, request: ChatCompletionRequest) -> ChatCompletionResult:
        body: dict[str, Any] = {
            "model": request.model,
            "messages": [self._message_payload(message) for message in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        if request.seed is not None:
            body["seed"] = request.seed
        if request.tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in request.tools
            ]
        response = await self._request("POST", "/chat/completions", json=body)
        return self._parse_completion(response)

    def _message_payload(self, message: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "role": message.role,
            "content": message.content,
        }
        if message.tool_call_id is not None:
            payload["tool_call_id"] = message.tool_call_id
        if message.tool_calls:
            payload["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments),
                    },
                }
                for call in message.tool_calls
            ]
        return payload

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[StructuredOutput],
        model: str,
    ) -> StructuredOutput:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 2048,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": output_type.__name__,
                    "strict": True,
                    "schema": output_type.model_json_schema(),
                },
            },
        }
        response = await self._request("POST", "/chat/completions", json=body)
        completion = self._parse_completion(response)
        try:
            return output_type.model_validate_json(
                self.structured_payload(completion.content)
            )
        except (ValueError, ValidationError) as exc:
            raise ProviderError(
                ProviderErrorCode.INVALID_STRUCTURED_OUTPUT,
                "Model returned invalid structured output",
            ) from exc

    @staticmethod
    def structured_payload(content: str | None) -> str:
        raw = (content or "").strip()
        if raw.startswith("```"):
            lines = raw.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines).strip()
        return raw

    def _parse_completion(self, response: httpx.Response) -> ChatCompletionResult:
        try:
            data = response.json()
            choice = data["choices"][0]
            message = choice["message"]
            calls = [
                ToolCall(
                    id=call["id"],
                    name=call["function"]["name"],
                    arguments=json.loads(call["function"]["arguments"]),
                )
                for call in message.get("tool_calls", [])
            ]
            return ChatCompletionResult(
                content=message.get("content"),
                tool_calls=calls,
                finish_reason=choice.get("finish_reason"),
                usage=CompletionUsage.model_validate(data.get("usage", {})),
            )
        except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
            raise ProviderError(
                ProviderErrorCode.MALFORMED_RESPONSE, "Malformed completion response"
            ) from exc
