from app.cf import build_item_similarity, recommend_for_user, similar_to
from app.trending import TrendingWindow

# Two clusters: {1,2,3} co-watched by users a,b ; {10,11} co-watched by c,d.
INTERACTIONS = [
    {"userId": "a", "movieId": 1, "weight": 1},
    {"userId": "a", "movieId": 2, "weight": 1},
    {"userId": "a", "movieId": 3, "weight": 1},
    {"userId": "b", "movieId": 1, "weight": 1},
    {"userId": "b", "movieId": 2, "weight": 1},
    {"userId": "c", "movieId": 10, "weight": 1},
    {"userId": "c", "movieId": 11, "weight": 1},
    {"userId": "d", "movieId": 10, "weight": 1},
    {"userId": "d", "movieId": 11, "weight": 1},
]


def test_ranks_within_cluster_items_as_most_similar():
    sim = build_item_similarity(INTERACTIONS)
    neighbors = [nid for nid, _ in similar_to(sim, 1)]
    assert 2 in neighbors  # 1 and 2 co-watched by a and b
    assert 10 not in neighbors  # different cluster, never co-watched


def test_cosine_scores_in_unit_range():
    sim = build_item_similarity(INTERACTIONS)
    for _, score in similar_to(sim, 1):
        assert 0 < score <= 1 + 1e-9


def test_recommends_unseen_neighbors_and_excludes_seen():
    sim = build_item_similarity(INTERACTIONS)
    recs = [rid for rid, _ in recommend_for_user(sim, {1: 1})]
    assert 2 in recs and 3 in recs
    assert 1 not in recs  # already seen


def test_trending_decays_over_time():
    w = TrendingWindow()
    w.add(5, weight=10, now=0)
    fresh = dict(w.top(now=0))[5]
    half_life_later = dict(w.top(now=15 * 60 * 1000))[5]
    assert half_life_later < fresh
    assert abs(half_life_later - fresh / 2) < 0.1  # ~halved after one half-life
