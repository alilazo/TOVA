import httpx
import pytest

from app.providers.lm_studio import LMStudioProvider


@pytest.mark.asyncio
async def test_inspect_model_states_reports_loaded_and_not_loaded() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url).endswith("/api/v0/models")
        return httpx.Response(
            200,
            json={
                "object": "list",
                "data": [
                    {
                        "id": "qwen/qwen3.6-35b-a3b",
                        "state": "loaded",
                        "loaded_context_length": 128000,
                        "max_context_length": 262144,
                        "type": "vlm",
                        "arch": "qwen35moe",
                    },
                    {
                        "id": "laguna-xs-2.1",
                        "state": "not-loaded",
                        "max_context_length": 262144,
                        "type": "llm",
                        "arch": "laguna",
                    },
                ],
            },
        )

    provider = LMStudioProvider(
        base_url="http://127.0.0.1:1234/v1",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )

    states = await provider.inspect_model_states()

    assert states[0]["id"] == "qwen/qwen3.6-35b-a3b"
    assert states[0]["state"] == "loaded"
    assert states[0]["loaded_context_length"] == 128000
    assert states[1]["state"] == "not-loaded"


@pytest.mark.asyncio
async def test_complete_logs_generation_lifecycle_without_token_leak(
    capsys: pytest.CaptureFixture[str],
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": "qwen/qwen3.6-35b-a3b",
                            "state": "loaded",
                            "loaded_context_length": 4096,
                        }
                    ]
                },
            )
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {"role": "assistant", "content": "hello"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": 1,
                    "completion_tokens": 1,
                    "total_tokens": 2,
                },
            },
        )

    provider = LMStudioProvider(
        base_url="http://127.0.0.1:1234/v1",
        api_token="secret-token-value",
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    from app.schemas.models import ChatCompletionRequest, ChatMessage

    await provider.complete(
        ChatCompletionRequest(
            model="qwen/qwen3.6-35b-a3b",
            messages=[ChatMessage(role="user", content="ping")],
        )
    )

    captured = capsys.readouterr().err
    assert "[TOVA][lm-studio]" in captured
    assert "phase=generate_start" in captured
    assert "phase=generate_complete" in captured
    assert "model='qwen/qwen3.6-35b-a3b'" in captured or 'model="qwen/qwen3.6-35b-a3b"' in captured
    assert "load_state='loaded'" in captured
    assert "secret-token-value" not in captured
