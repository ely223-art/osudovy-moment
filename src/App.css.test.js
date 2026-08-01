import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("marker zoom styling", () => {
  it("does not reset public-map marker transforms so zoom scaling can apply", () => {
    const cssPath = path.resolve(__dirname, "App.css");
    const css = readFileSync(cssPath, "utf8");

    expect(css).toContain(".completion-map-marker {");
    expect(css).toContain("scale(var(--marker-scale, 1))");
    expect(css).not.toContain(".public-map-marker {\n  transform: none;");
  });
});
