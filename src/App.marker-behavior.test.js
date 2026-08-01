import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public marker zoom behavior", () => {
  it("keeps Leaflet positioning intact while applying zoom scale via CSS variable", () => {
    const appPath = path.resolve(__dirname, "App.jsx");
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain("markerElement.style.setProperty(\"--marker-scale\", scaleValue);");
    expect(source).toContain("zoomAnimation: false");
    expect(source).toContain("markerZoomAnimation: false");
    expect(source).toContain(`zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      dragging: true,
      attributionControl: false,
      worldCopyJump: true,
      zoomSnap: 1,
      zoomDelta: 1,
      minZoom: 3,
      maxZoom: 15,
      preferCanvas: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false,`);
    expect(source).not.toContain("markerElement.style.transform =");
  });
});
