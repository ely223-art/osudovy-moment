export const buildSelectionCluster = (items = [], currentItem, radiusPx = 90, pointGetter = () => ({ x: 0, y: 0 })) => {
  if (!Array.isArray(items) || !items.length || !currentItem) {
    return { cluster: [], index: 0 };
  }

  const anchor = pointGetter(currentItem) || { x: 0, y: 0 };

  const scored = items
    .map((item) => {
      const point = pointGetter(item) || { x: 0, y: 0 };
      const dx = point.x - anchor.x;
      const dy = point.y - anchor.y;
      return {
        item,
        distance: Math.hypot(dx, dy),
      };
    })
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= radiusPx)
    .sort((left, right) => left.distance - right.distance);

  const unique = [];
  const seen = new Set();

  scored.forEach((entry) => {
    const itemId = entry.item?.id;
    if (!itemId || seen.has(itemId)) {
      return;
    }

    seen.add(itemId);
    unique.push(entry.item);
  });

  const startIndex = unique.findIndex((item) => item?.id === currentItem?.id);
  const safeIndex = startIndex >= 0 ? startIndex : 0;

  return {
    cluster: unique,
    index: safeIndex,
  };
};

export const moveClusterSelection = (cluster = [], index = 0, direction = 1) => {
  if (!cluster.length) {
    return null;
  }

  const nextIndex = (index + direction + cluster.length) % cluster.length;
  return cluster[nextIndex] || null;
};
