import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("public marker zoom behavior", () => {
  it("keeps public marker positioning pinned to the map container point while scaling via CSS", () => {
    const appPath = path.resolve(__dirname, "App.jsx");
    const cssPath = path.resolve(__dirname, "App.css");
    const source = readFileSync(appPath, "utf8");
    const cssSource = readFileSync(cssPath, "utf8");

    expect(source).toContain("const spreadOverlappingMoments = (moments = [], focusMomentId = \"\") => {");
    expect(source).toContain("const selectedPublicMomentIdRef = useRef(\"\");");
    expect(source).toContain("const publicMarkerLayoutSyncRef = useRef(null);");
    expect(source).toContain("const markerElement = L.DomUtil.create(\"div\", \"public-map-marker-shell\");");
    expect(source).toContain("const syncPublicMarkerPositions = (focusMomentId = selectedPublicMomentIdRef.current) => {");
    expect(source).toContain("publicMarkerLayoutSyncRef.current = syncPublicMarkerPositions;");
    expect(source).toContain("publicMarkerLayoutSyncRef.current?.(selectedPublicMomentIdRef.current);");
    expect(source).toContain("markerElement.style.left = `${point.x - markerSize / 2}px`;");
    expect(source).toContain("markerElement.style.top = `${point.y - markerSize / 2}px`;");
    expect(source).toContain('element.classList.toggle("is-selected", isActive);');
    expect(cssSource).toContain(".public-map-marker-shell.is-selected");
    expect(source).not.toContain("L.marker([moment.latitude, moment.longitude]");
  });
});
