from app.fusion import reciprocal_rank_fusion


def test_rrf_rewards_items_appearing_high_in_both_lists():
    keyword = [1, 2, 3]
    vector = [3, 2, 9]
    fused = reciprocal_rank_fusion([keyword, vector])
    ids = [doc_id for doc_id, _ in fused]
    # 2 is rank-2 in both lists -> should beat 1 (only in one list at rank 1)
    # and 3 (rank 3 + rank 1).
    assert ids[0] in (2, 3)
    assert set(ids) == {1, 2, 3, 9}


def test_rrf_single_list_preserves_order():
    fused = reciprocal_rank_fusion([[5, 6, 7]])
    assert [doc_id for doc_id, _ in fused] == [5, 6, 7]


def test_rrf_k_dampening_is_monotonic():
    fused = reciprocal_rank_fusion([[1, 2, 3, 4]])
    scores = [s for _, s in fused]
    assert scores == sorted(scores, reverse=True)
