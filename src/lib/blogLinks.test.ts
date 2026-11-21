import { describe, expect, it } from "vitest";
import { blogHomeUrl, blogIssueUrl } from "./blogLinks";

describe("blog links", () => {
  it("points the batsirai letters at the blog", () => {
    expect(blogIssueUrl("batsirai", "thank-god-for-normal")).toBe("https://alreadylovedkids.com/blog/thank-god-for-normal");
    expect(blogHomeUrl("batsirai")).toBe("https://alreadylovedkids.com/blog");
  });
  it("has no blog for other newsletters", () => {
    expect(blogIssueUrl("other", "x")).toBeNull();
    expect(blogHomeUrl("other")).toBeNull();
  });
});
