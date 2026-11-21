import { describe, expect, it } from "vitest";
import { canonicalHome, canonicalIssue } from "./canonical";

describe("canonical URLs", () => {
  it("sends the AlreadyLoved letters to the blog", () => {
    expect(canonicalIssue("batsirai", "thank-god-for-normal")).toBe("https://alreadylovedkids.com/blog/thank-god-for-normal");
    expect(canonicalHome("batsirai")).toBe("https://alreadylovedkids.com/letters");
  });

  it("escapes the issue slug", () => {
    expect(canonicalIssue("batsirai", "a b/c")).toBe("https://alreadylovedkids.com/blog/a%20b%2Fc");
  });

  it("leaves other newsletters on their own Studio pages", () => {
    expect(canonicalIssue("someone-else", "x")).toBeNull();
    expect(canonicalHome("someone-else")).toBeNull();
  });
});
