from types import SimpleNamespace

import pytest

from tui_gateway.server import (
    _begin_turn_performance,
    _finish_turn_performance,
    _get_usage,
    _record_first_token_performance,
)


def test_turn_performance_freezes_duration_and_reports_session_metrics():
    agent = SimpleNamespace(
        model="deepseek-v4-flash",
        session_api_calls=2,
        session_cache_read_tokens=300,
        session_cache_write_tokens=0,
        session_input_tokens=100,
        session_llm_seconds=2.0,
        session_output_tokens=50,
        session_tool_calls=3,
        session_tool_seconds=4.0,
        session_total_tokens=450,
    )

    _begin_turn_performance(agent, 10.0)
    _record_first_token_performance(agent, 10.5)
    _record_first_token_performance(agent, 11.0)
    _finish_turn_performance(agent, 12.0)

    first = _get_usage(agent)

    # A second finish after the turn was cleared represents idle time and must
    # not mutate the displayed response duration.
    _finish_turn_performance(agent, 99.0)
    second = _get_usage(agent)

    assert first["last_turn_seconds"] == pytest.approx(2.0)
    assert second["last_turn_seconds"] == pytest.approx(2.0)
    assert first["ttft_avg_seconds"] == pytest.approx(0.5)
    assert first["tokens_per_second"] == pytest.approx(25.0)
    assert first["turns"] == 1
    assert second["turns"] == 1
    assert first["cache_read"] == 300
    assert first["cache_write"] == 0
    assert first["tool_calls"] == 3
    assert first["tool_seconds"] == pytest.approx(4.0)
