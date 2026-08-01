import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public marker zoom behavior", () => {
  it("keeps Leaflet positioning intact while applying zoom scale via CSS variable", () => {
    const appPath = path.resolve(__dirname, "App.jsx");
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain("markerElement.style.setProperty(\"--marker-scale\", scaleValue);");
    expect(source).not.toContain("markerElement.style.setProperty(\"transform\", `translate(-50%, -50%) scale(${scaleValue})`);");
  });
});
