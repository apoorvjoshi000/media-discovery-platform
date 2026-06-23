import { describe, it, expect } from "vitest";
import { splitCsv, parseTmdbCsv } from "./csv.js";

describe("splitCsv", () => {
  it("splits simple rows", () => {
    expect(splitCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respects quoted fields with embedded commas", () => {
    const rows = splitCsv('id,overview\n1,"a, b, c"');
    expect(rows[1]).toEqual(["1", "a, b, c"]);
  });

  it("handles escaped double-quotes", () => {
    const rows = splitCsv('q\n"she said ""hi"""');
    expect(rows[1]).toEqual(['she said "hi"']);
  });
});

describe("parseTmdbCsv", () => {
  it("maps TMDB columns into Movie objects and parses the genres JSON", () => {
    const csv =
      'id,title,release_date,overview,genres,original_language,vote_average,runtime\n' +
      '99,Test Movie,2020-05-01,A test plot,"[{""id"":1,""name"":""Drama""}]",en,7.5,120';
    const [m] = parseTmdbCsv(csv);
    expect(m.movieId).toBe(99);
    expect(m.title).toBe("Test Movie");
    expect(m.year).toBe(2020);
    expect(m.genres).toEqual(["Drama"]);
    expect(m.voteAverage).toBe(7.5);
  });

  it("skips rows without an id", () => {
    const csv = "id,title\n,Orphan\n1,Real";
    expect(parseTmdbCsv(csv)).toHaveLength(1);
  });
});
