from app.csv_util import parse_tmdb_csv


def test_maps_tmdb_columns_and_parses_genres():
    csv = (
        "id,title,release_date,overview,genres,original_language,vote_average,runtime\n"
        '99,Test Movie,2020-05-01,A test plot,"[{""id"":1,""name"":""Drama""}]",en,7.5,120'
    )
    m = parse_tmdb_csv(csv)[0]
    assert m["movieId"] == 99
    assert m["title"] == "Test Movie"
    assert m["year"] == 2020
    assert m["genres"] == ["Drama"]
    assert m["voteAverage"] == 7.5


def test_skips_rows_without_id():
    csv = "id,title\n,Orphan\n1,Real"
    assert len(parse_tmdb_csv(csv)) == 1


def test_handles_quoted_commas_in_overview():
    csv = "id,title,overview\n1,X,\"a, b, c\""
    assert parse_tmdb_csv(csv)[0]["overview"] == "a, b, c"
