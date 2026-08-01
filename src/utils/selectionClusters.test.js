import { describe, expect, it } from "vitest";
import { buildSelectionCluster, moveClusterSelection } from "./selectionClusters";

describe("buildSelectionCluster", () => {
  it("collects nearby items around the selected one", () => {
    const items = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 200, y: 0 },
      { id: "d", x: 20, y: 10 },
    ];

    const result = buildSelectionCluster(items, items[0], 25, (item) => ({ x: item.x, y: item.y }));

    expect(result.cluster.map((item) => item.id)).toEqual(["a", "b", "d"]);
    expect(result.index).toBe(0);
  });

  it("uses the current anchor to build a cluster even when the current item is not in the list", () => {
    const items = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 200, y: 0 },
    ];

    const result = buildSelectionCluster(items, { id: "z", x: 8, y: 0 }, 25, (item) => ({ x: item.x, y: item.y }));

    expect(result.cluster.map((item) => item.id)).toEqual(["b", "a"]);
    expect(result.index).toBe(0);
  });
});

describe("moveClusterSelection", () => {
  it("moves forward and backward through the cluster", () => {
    const cluster = [{ id: "a" }, { id: "b" }, { id: "c" }];

    expect(moveClusterSelection(cluster, 1, 1)).toEqual(cluster[2]);
    expect(moveClusterSelection(cluster, 1, -1)).toEqual(cluster[0]);
    expect(moveClusterSelection(cluster, 0, -1)).toEqual(cluster[2]);
  });
});
