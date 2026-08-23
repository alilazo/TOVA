from app.tools.browser_qa import evaluate_static_page_audit


def test_static_page_audit_passes_when_criteria_are_visible() -> None:
    html = "<html><body><h1>Welcome</h1><button>Count</button><p>0</p></body></html>"
    result = evaluate_static_page_audit(
        html,
        ["Welcome", "Count", "0"],
    )
    assert result["verdict"] == "pass"
    assert "Welcome" in result["visible_text"]
    assert result["ok"] is True


def test_static_page_audit_fails_when_criteria_are_missing() -> None:
    html = "<html><body><h1>Welcome</h1></body></html>"
    result = evaluate_static_page_audit(html, ["Count button increments"])
    assert result["verdict"] == "fail"
    assert result["ok"] is True
    assert "Count button increments" in result["summary"]
