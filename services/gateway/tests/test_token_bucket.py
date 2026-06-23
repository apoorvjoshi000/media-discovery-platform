from app.token_bucket import evaluate


def test_first_request_starts_full_and_allows():
    allowed, remaining = evaluate(None, None, now=1000, capacity=10, refill=5)
    assert allowed is True
    assert remaining == 9


def test_denies_when_empty():
    allowed, remaining = evaluate(0.0, ts=1000, now=1000, capacity=10, refill=5)
    assert allowed is False
    assert remaining == 0.0


def test_refills_over_time_but_caps_at_capacity():
    # empty bucket, 10s later at 5 tokens/s -> would be 50, capped at 10
    allowed, remaining = evaluate(0.0, ts=0, now=10_000, capacity=10, refill=5)
    assert allowed is True
    assert remaining == 9  # 10 (capped) minus the 1 just spent


def test_partial_refill_is_proportional():
    # half a token per 100ms at 5/s; 600ms -> +3 tokens from 0
    allowed, remaining = evaluate(0.0, ts=0, now=600, capacity=10, refill=5)
    assert allowed is True
    assert abs(remaining - 2.0) < 1e-9  # 3 refilled, 1 spent
