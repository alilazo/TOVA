from app.core.launch import maybe_open_ui


def test_maybe_open_ui_opens_local_url_for_packaged_app() -> None:
    opened: list[str] = []
    assert maybe_open_ui("8000", opener=opened.append, env={}, frozen=True) is True
    assert opened == ["http://127.0.0.1:8000/"]


def test_maybe_open_ui_stays_closed_during_local_dev() -> None:
    opened: list[str] = []
    assert maybe_open_ui("8000", opener=opened.append, env={}, frozen=False) is False
    assert opened == []


def test_maybe_open_ui_can_be_disabled() -> None:
    opened: list[str] = []
    assert (
        maybe_open_ui(
            "8004",
            opener=opened.append,
            env={"TOVA_OPEN_BROWSER": "0"},
            frozen=True,
        )
        is False
    )
    assert opened == []
