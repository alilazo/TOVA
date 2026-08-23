from app.core.console_display import (
    format_status_line,
    loading_frame,
    tova_ascii_art,
)


def test_ascii_art_shows_tova() -> None:
    art = tova_ascii_art()
    assert "TOVA" in art
    assert art.strip()
    assert "\n" in art


def test_loading_frames_animate() -> None:
    frames = [loading_frame(index) for index in range(4)]
    assert all("Loading" in frame for frame in frames)
    assert len(set(frames)) > 1


def test_status_line_waits_when_lm_studio_is_missing() -> None:
    assert (
        format_status_line(state="unavailable", selected_model=None)
        == "Waiting for LM Studio, Model not found"
    )
    assert (
        format_status_line(state="unconfigured", selected_model=None)
        == "Waiting for LM Studio, Model not found"
    )


def test_status_line_uses_green_when_connected() -> None:
    line = format_status_line(state="connected", selected_model="qwen/qwen3.6-35b-a3b")
    assert "Connected to: qwen/qwen3.6-35b-a3b" in line
    assert "\033[32m" in line
    assert "\033[0m" in line
