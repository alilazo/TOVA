import httpx
import pytest
from pydantic import BaseModel

from app.providers.lm_studio import LMStudioProvider
from app.providers.openai_compatible import ProviderError, ProviderErrorCode
from app.schemas.models import ChatCompletionRequest, ChatMessage, ToolDefinition


class Answer(BaseModel):
    answer: str


@pytest.mark.asyncio
async def test_lists_models_and_parses_completion_tool_calls() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "qwen", "owned_by": "local"}]})
        return httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "Inspecting.",
                        "tool_calls": [{
                            "id": "call-1",
                            "type": "function",
                            "function": {
                                "name": "repository.read",
                                "arguments": '{"path":"README.md"}',
                            },
                        }],
                    },
                    "finish_reason": "tool_calls",
                }],
                "usage": {"prompt_tokens": 2, "completion_tokens": 3, "total_tokens": 5},
            },
        )

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    models = await provider.list_models()
    result = await provider.complete(
        ChatCompletionRequest(
            model="qwen",
            messages=[ChatMessage(role="user", content="Read the file")],
            tools=[ToolDefinition(name="repository.read", description="Read", parameters={})],
        )
    )

    assert models[0].id == "qwen"
    assert result.tool_calls[0].arguments == {"path": "README.md"}
    assert result.usage.total_tokens == 5


@pytest.mark.asyncio
async def test_disables_reasoning_on_chat_completions() -> None:
    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "qwen"}]})
        body = __import__("json").loads(request.content)
        captured.update(body)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {},
            },
        )

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    await provider.complete(
        ChatCompletionRequest(
            model="qwen",
            messages=[ChatMessage(role="user", content="Say ok")],
        )
    )
    assert captured.get("reasoning_effort") == "none"


@pytest.mark.asyncio
async def test_generates_schema_constrained_output_and_redacts_secret() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        body = __import__("json").loads(request.content)
        assert "response_format" not in body
        assert "JSON" in body["messages"][0]["content"]
        assert '"answer"' in body["messages"][0]["content"]
        assert body.get("reasoning_effort") == "none"
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"answer":"ok"}'}}]},
        )

    provider = LMStudioProvider(
        api_token="very-secret",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    result = await provider.generate_structured(
        system_prompt="Return JSON",
        user_prompt="Answer",
        output_type=Answer,
        model="qwen",
    )
    assert result.answer == "ok"

    async def auth_error(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="token very-secret rejected")

    provider = LMStudioProvider(
        api_token="very-secret",
        client=httpx.AsyncClient(transport=httpx.MockTransport(auth_error)),
    )
    with pytest.raises(ProviderError) as raised:
        await provider.list_models()
    assert raised.value.code == ProviderErrorCode.AUTHENTICATION_FAILED
    assert "very-secret" not in str(raised.value)


@pytest.mark.asyncio
async def test_maps_timeout_and_malformed_response_to_stable_errors() -> None:
    async def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(timeout))
    )
    with pytest.raises(ProviderError) as raised:
        await provider.list_models()
    assert raised.value.code == ProviderErrorCode.TIMEOUT

    async def malformed(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        return httpx.Response(200, json={"choices": []})

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(malformed))
    )
    with pytest.raises(ProviderError) as raised:
        await provider.complete(
            ChatCompletionRequest(
                model="qwen",
                messages=[ChatMessage(role="user", content="hello")],
            )
        )
    assert raised.value.code == ProviderErrorCode.MALFORMED_RESPONSE


@pytest.mark.asyncio
async def test_maps_terminated_generation_to_cancelled() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        return httpx.Response(400, text='{"error":"terminated"}')

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(ProviderError) as raised:
        await provider.complete(
            ChatCompletionRequest(
                model="qwen",
                messages=[ChatMessage(role="user", content="hello")],
            )
        )
    assert raised.value.code == ProviderErrorCode.GENERATION_CANCELLED
    assert "LM Studio" in str(raised.value)


@pytest.mark.asyncio
async def test_structured_generation_sets_max_tokens() -> None:
    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        captured.update(__import__("json").loads(request.content))
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": '{"answer":"ok"}'}}]},
        )

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    await provider.generate_structured(
        system_prompt="Return JSON",
        user_prompt="Answer",
        output_type=Answer,
        model="qwen",
    )
    assert captured.get("max_tokens") == 2048


@pytest.mark.asyncio
async def test_structured_generation_accepts_fenced_json_and_retries_once() -> None:
    calls = {"count": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "loaded"}]},
            )
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "qwen"}]})
        calls["count"] += 1
        if calls["count"] == 1:
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "not json"}}]},
            )
        return httpx.Response(
            200,
            json={
                "choices": [{
                    "message": {"content": "```json\n{\"answer\":\"ok\"}\n```"},
                }],
            },
        )

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    result = await provider.generate_structured(
        system_prompt="Return JSON",
        user_prompt="Answer",
        output_type=Answer,
        model="qwen",
    )
    assert result.answer == "ok"
    assert calls["count"] == 2


@pytest.mark.asyncio
async def test_connection_requires_model_loaded() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "qwen", "state": "not-loaded"},
                        {"id": "other", "state": "loaded"},
                    ]
                },
            )
        return httpx.Response(200, json={"data": [{"id": "qwen"}, {"id": "other"}]})

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    result = await provider.test_connection("qwen")
    assert result.connected is False
    assert result.error_code == ProviderErrorCode.MODEL_NOT_LOADED.value
    assert result.error is not None
    assert "load" in result.error.lower()

    loaded = await provider.test_connection("other")
    assert loaded.connected is True
    assert loaded.model == "other"


@pytest.mark.asyncio
async def test_complete_rejects_unloaded_model_without_chat_request() -> None:
    calls = {"chat": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen", "state": "not-loaded"}]},
            )
        if request.url.path.endswith("/chat/completions"):
            calls["chat"] += 1
        return httpx.Response(200, json={"data": [{"id": "qwen"}]})

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    with pytest.raises(ProviderError) as raised:
        await provider.complete(
            ChatCompletionRequest(
                model="qwen",
                messages=[ChatMessage(role="user", content="hello")],
            )
        )
    assert raised.value.code == ProviderErrorCode.MODEL_NOT_LOADED
    assert calls["chat"] == 0


@pytest.mark.asyncio
async def test_complete_allows_high_context_when_model_is_loaded() -> None:
    calls = {"chat": 0}

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "qwen",
                            "state": "loaded",
                            "loaded_context_length": 128000,
                        }
                    ]
                },
            )
        if request.url.path.endswith("/chat/completions"):
            calls["chat"] += 1
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                    "usage": {},
                },
            )
        return httpx.Response(200, json={"data": [{"id": "qwen"}]})

    provider = LMStudioProvider(
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    result = await provider.complete(
        ChatCompletionRequest(
            model="qwen",
            messages=[ChatMessage(role="user", content="hello")],
        )
    )
    assert result.content == "ok"
    assert calls["chat"] == 1
