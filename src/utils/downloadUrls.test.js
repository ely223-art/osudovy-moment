import { describe, expect, it } from "vitest";
import { buildServerDownloadUrl } from "./downloadUrls";

describe("buildServerDownloadUrl", () => {
  it("builds a direct server attachment URL from a direct function image URL", () => {
    const url = buildServerDownloadUrl(
      "https://osudovymoment.cz/.netlify/functions/share-image?id=abc123",
      "muj-moment.jpg"
    );

    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://osudovymoment.cz");
    expect(parsed.pathname).toBe("/.netlify/functions/share-image");
    expect(parsed.searchParams.get("id")).toBe("abc123");
    expect(parsed.searchParams.get("download")).toBe("1");
    expect(parsed.searchParams.get("filename")).toBe("muj-moment.jpg");
  });

  it("builds the same server attachment URL from the legacy /i/:id.jpg image URL", () => {
    const url = buildServerDownloadUrl("https://osudovymoment.cz/i/abc123.jpg", "muj-moment.jpg");

    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://osudovymoment.cz");
    expect(parsed.pathname).toBe("/.netlify/functions/share-image");
    expect(parsed.searchParams.get("id")).toBe("abc123");
    expect(parsed.searchParams.get("download")).toBe("1");
    expect(parsed.searchParams.get("filename")).toBe("muj-moment.jpg");
  });

  it("returns an empty string for a missing image URL", () => {
    expect(buildServerDownloadUrl("", "muj-moment.jpg")).toBe("");
  });
});