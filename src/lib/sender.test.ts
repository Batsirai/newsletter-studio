import { describe, expect, it } from "vitest";
import { senderFor } from "./sender";

const letters = { slug: "batsirai", fromName: "Batsirai | AlreadyLoved" };

describe("senderFor", () => {
  it("sends as <slug>@domain under a *@domain pattern", () => {
    expect(senderFor(["*@letters.alreadylovedkids.com"], letters)).toEqual({
      address: "batsirai@letters.alreadylovedkids.com",
      name: "Batsirai | AlreadyLoved",
    });
  });

  it("uses an exact allowed address as it is", () => {
    expect(senderFor(["news@example.com"], letters)?.address).toBe("news@example.com");
  });

  it("falls back to the Gateway's sender without patterns or a From name", () => {
    expect(senderFor([], letters)).toBeUndefined();
    expect(senderFor(["*@x.com"], { slug: "a", fromName: "" })).toBeUndefined();
  });
});
