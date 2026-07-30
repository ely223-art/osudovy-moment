import { describe, expect, it } from "vitest";
import { extractShareId } from "./shareRequest";

describe("extractShareId", () => {
  it("reads the id from a query string", () => {
    expect(extractShareId("https://osudovymoment.cz/.netlify/functions/share-page?id=abc123")).toBe("abc123");
  });

  it("reads the id from a rewritten share page path", () => {
    expect(extractShareId("https://osudovymoment.cz/s/abc123")).toBe("abc123");
  });

  it("reads the id from a rewritten image path", () => {
    expect(extractShareId("https://osudovymoment.cz/i/abc123.jpg")).toBe("abc123");
  });

  it("returns empty string when there is no id", () => {
    expect(extractShareId("https://osudovymoment.cz/s/")).toBe("");
  });
});