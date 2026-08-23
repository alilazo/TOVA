from __future__ import annotations

import json
import time
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.providers.lm_debug import elapsed_ms, lm_debug
from app.providers.openai_compatible import (
    OpenAICompatibleProvider,
    ProviderError,
    ProviderErrorCode,
)
from app.schemas.models import (
    ChatCompletionRequest,
    ChatCompletionResult,
    ModelConnectionTest,
)

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class LMStudioProvider(OpenAICompatibleProvider):
    provider_name = "lm-studio"

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:1234/v1",
        api_token: str | None = None,
        timeout: float = 60,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        super().__init__(
            base_url=base_url,
            api_token=api_token,
            timeout=timeout,
            client=client,
        )
        self._active_generations = 0

    @property
    def is_generating(self) -> bool:
        return self._active_generations > 0

    def _server_root(self) -> str:
        root = self.base_url.rstrip("/")
        if root.endswith("/v1"):
            root = root[: -len("/v1")]
        return root.rstrip("/")

    async def inspect_model_states(self) -> list[dict[str, Any]]:
        url = f"{self._server_root()}/api/v0/models"
        lm_debug("load_state_probe", url=url)
        started = time.perf_counter()
        try:
            response = await self._client.get(
                url,
                headers=self._headers(),
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            lm_debug(
                "load_state_timeout",
                url=url,
                latency_ms=elapsed_ms(started),
            )
            raise ProviderError(
                ProviderErrorCode.TIMEOUT,
                "Model load-state probe timed out",
            ) from exc
        except httpx.RequestError as exc:
            lm_debug(
                "load_state_disconnected",
                url=url,
                latency_ms=elapsed_ms(started),
                error=self._redact(str(exc)),
            )
            raise ProviderError(
                ProviderErrorCode.DISCONNECTED,
                self._redact(f"Could not probe model load state: {exc}"),
            ) from exc

        if response.status_code >= 400:
            lm_debug(
                "load_state_http_error",
                status=response.status_code,
                latency_ms=elapsed_ms(started),
                body=self._redact(response.text)[:200],
            )
            return []

        payload = response.json()
        rows = payload.get("data", []) if isinstance(payload, dict) else []
        states: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict) or "id" not in row:
                continue
            states.append(
                {
                    "id": row.get("id"),
                    "state": row.get("state"),
                    "type": row.get("type"),
                    "arch": row.get("arch"),
                    "loaded_context_length": row.get("loaded_context_length"),
                    "max_context_length": row.get("max_context_length"),
                }
            )
        loaded = [item["id"] for item in states if item.get("state") == "loaded"]
        lm_debug(
            "load_state_result",
            latency_ms=elapsed_ms(started),
            model_count=len(states),
            loaded=loaded,
        )
        return states

    async def _load_state_for(self, model: str | None) -> str | None:
        if model is None:
            return None
        try:
            states = await self.inspect_model_states()
        except ProviderError as exc:
            lm_debug(
                "load_state_unavailable",
                model=model,
                error_code=exc.code.value,
                error=str(exc),
            )
            return None
        for item in states:
            if item.get("id") == model:
                return str(item.get("state") or "unknown")
        return "missing"

    async def _require_generation_ready(self, model: str) -> dict[str, Any]:
        try:
            states = await self.inspect_model_states()
        except ProviderError:
            raise
        match = next((item for item in states if item.get("id") == model), None)
        if match is None or match.get("state") != "loaded":
            raise ProviderError(
                ProviderErrorCode.MODEL_NOT_LOADED,
                "Selected model is not loaded in LM Studio",
            )
        return match

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        started = time.perf_counter()
        payload = kwargs.get("json")
        if (
            method.upper() == "POST"
            and path.rstrip("/").endswith("/chat/completions")
            and isinstance(payload, dict)
        ):
            # Qwen thinking models otherwise burn the whole timeout on reasoning_content.
            kwargs = {**kwargs, "json": {**payload, "reasoning_effort": "none"}}
            payload = kwargs["json"]
        model = None
        if isinstance(payload, dict):
            model = payload.get("model")
        lm_debug(
            "http_request",
            method=method,
            path=path,
            model=model,
            base_url=self.base_url,
        )
        try:
            response = await super()._request(method, path, **kwargs)
        except ProviderError as exc:
            lm_debug(
                "http_error",
                method=method,
                path=path,
                model=model,
                latency_ms=elapsed_ms(started),
                error_code=exc.code.value,
                error=str(exc),
            )
            raise
        lm_debug(
            "http_response",
            method=method,
            path=path,
            model=model,
            status=response.status_code,
            latency_ms=elapsed_ms(started),
        )
        return response

    async def test_connection(self, model: str | None = None) -> ModelConnectionTest:
        lm_debug("health_check_start", model=model, base_url=self.base_url)
        load_state: str | None = None
        try:
            if model is not None:
                match = await self._require_generation_ready(model)
                load_state = str(match.get("state") or "loaded")
            else:
                load_state = await self._load_state_for(model)
            result = await super().test_connection(model)
        except ProviderError as exc:
            result = ModelConnectionTest(
                connected=False,
                latency_ms=0,
                model=model,
                error_code=exc.code.value,
                error=str(exc),
            )
            if load_state is None and model is not None:
                load_state = await self._load_state_for(model)
        lm_debug(
            "health_check_result",
            model=result.model,
            connected=result.connected,
            latency_ms=result.latency_ms,
            load_state=load_state,
            error_code=result.error_code,
            error=result.error,
        )
        return result

    async def complete(self, request: ChatCompletionRequest) -> ChatCompletionResult:
        self._active_generations += 1
        started = time.perf_counter()
        load_state: str | None = None
        try:
            match = await self._require_generation_ready(request.model)
            load_state = str(match.get("state") or "loaded")
            lm_debug(
                "generate_start",
                model=request.model,
                load_state=load_state,
                loaded_context_length=match.get("loaded_context_length"),
                message_count=len(request.messages),
                tool_count=len(request.tools or []),
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )
            try:
                result = await super().complete(request)
            except ProviderError as exc:
                lm_debug(
                    "generate_failed",
                    model=request.model,
                    load_state=load_state,
                    latency_ms=elapsed_ms(started),
                    error_code=exc.code.value,
                    error=str(exc),
                )
                raise
            lm_debug(
                "generate_complete",
                model=request.model,
                load_state=load_state,
                latency_ms=elapsed_ms(started),
                finish_reason=result.finish_reason,
                tool_calls=len(result.tool_calls),
                content_chars=len(result.content or ""),
                prompt_tokens=result.usage.prompt_tokens,
                completion_tokens=result.usage.completion_tokens,
                total_tokens=result.usage.total_tokens,
            )
            return result
        except ProviderError as exc:
            if load_state is None:
                lm_debug(
                    "generate_failed",
                    model=request.model,
                    load_state=load_state,
                    latency_ms=elapsed_ms(started),
                    error_code=exc.code.value,
                    error=str(exc),
                )
            raise
        finally:
            self._active_generations -= 1

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[StructuredOutput],
        model: str,
    ) -> StructuredOutput:
        self._active_generations += 1
        started = time.perf_counter()
        load_state: str | None = None
        try:
            match = await self._require_generation_ready(model)
            load_state = str(match.get("state") or "loaded")
            lm_debug(
                "structured_start",
                model=model,
                load_state=load_state,
                loaded_context_length=match.get("loaded_context_length"),
                schema=getattr(output_type, "__name__", str(output_type)),
                system_chars=len(system_prompt),
                user_chars=len(user_prompt),
            )
            try:
                schema = json.dumps(output_type.model_json_schema(), separators=(",", ":"))
                result: StructuredOutput | None = None
                last_parse_error: Exception | None = None
                for attempt in range(2):
                    body = {
                        "model": model,
                        "messages": [
                            {
                                "role": "system",
                                "content": (
                                    f"{system_prompt}\n\n"
                                    "Return only valid JSON. Do not wrap it in Markdown. "
                                    f"The JSON must match this schema: {schema}"
                                ),
                            },
                            {"role": "user", "content": user_prompt},
                        ],
                        "max_tokens": 2048,
                    }
                    response = await self._request("POST", "/chat/completions", json=body)
                    completion = self._parse_completion(response)
                    try:
                        result = output_type.model_validate_json(
                            self.structured_payload(completion.content)
                        )
                        break
                    except (ValueError, ValidationError) as exc:
                        last_parse_error = exc
                        if attempt == 0:
                            continue
                        raise ProviderError(
                            ProviderErrorCode.INVALID_STRUCTURED_OUTPUT,
                            "Model returned invalid structured output",
                        ) from exc
                if result is None:
                    raise ProviderError(
                        ProviderErrorCode.INVALID_STRUCTURED_OUTPUT,
                        "Model returned invalid structured output",
                    ) from last_parse_error
            except (ValueError, ValidationError) as exc:
                lm_debug(
                    "structured_failed",
                    model=model,
                    load_state=load_state,
                    latency_ms=elapsed_ms(started),
                    error_code=ProviderErrorCode.INVALID_STRUCTURED_OUTPUT.value,
                    error="Model returned invalid structured output",
                )
                raise ProviderError(
                    ProviderErrorCode.INVALID_STRUCTURED_OUTPUT,
                    "Model returned invalid structured output",
                ) from exc
            except ProviderError as exc:
                lm_debug(
                    "structured_failed",
                    model=model,
                    load_state=load_state,
                    latency_ms=elapsed_ms(started),
                    error_code=exc.code.value,
                    error=str(exc),
                )
                raise
            lm_debug(
                "structured_complete",
                model=model,
                load_state=load_state,
                latency_ms=elapsed_ms(started),
                schema=getattr(output_type, "__name__", str(output_type)),
            )
            return result
        except ProviderError as exc:
            if load_state is None:
                lm_debug(
                    "structured_failed",
                    model=model,
                    load_state=load_state,
                    latency_ms=elapsed_ms(started),
                    error_code=exc.code.value,
                    error=str(exc),
                )
            raise
        finally:
            self._active_generations -= 1
