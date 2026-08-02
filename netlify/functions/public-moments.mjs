import { getStore } from "@netlify/blobs";

const STORE_NAME = "public-moments";
const INDEX_KEY = "moments.json";
const MAX_MOMENTS = 3000;

const toJsonResponse = (status, payload) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const normalizeId = (value = "") => String(value || "").trim().replace(/[^a-zA-Z0-9-]/g, "");

const parseCoordinate = (value) => {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeReactionState = (value = {}) => {
  const normalized = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    count: Math.max(0, Number(normalized?.count) || 0),
    liked: Boolean(normalized?.liked),
  };
};

const normalizeReactions = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, reaction]) => Boolean(key) && reaction && typeof reaction === 'object' && !Array.isArray(reaction))
      .map(([key, reaction]) => [normalizeId(key), normalizeReactionState(reaction)])
  );
};

const normalizeMoment = (moment = {}, options = {}) => {
  const { requireOwnerId = false } = options;
  const id = normalizeId(moment?.id || "");
  const ownerId = normalizeId(moment?.ownerId || "") || normalizeId(moment?.id || "");
  const latitude = parseCoordinate(moment?.latitude);
  const longitude = parseCoordinate(moment?.longitude);

  if (!id || (requireOwnerId && !ownerId) || latitude === null || longitude === null) {
    return null;
  }

  return {
    id,
    ownerId,
    obec: String(moment?.obec || "").slice(0, 120),
    okres: String(moment?.okres || "").slice(0, 120),
    kraj: String(moment?.kraj || "").slice(0, 120),
    stat: String(moment?.stat || "").slice(0, 120),
    latitude,
    longitude,
    symbolType: String(moment?.symbolType || "").slice(0, 60),
    symbolImage: String(moment?.symbolImage || "").slice(0, 400),
    symbolLabel: String(moment?.symbolLabel || "").slice(0, 100),
    nazev: String(moment?.nazev || "").slice(0, 180),
    prikaz: String(moment?.prikaz || "").slice(0, 500),
    datum: String(moment?.datum || "").slice(0, 30),
    createdAt: String(moment?.createdAt || new Date().toISOString()).slice(0, 64),
    reactions: normalizeReactions(moment?.reactions),
  };
};

const sortByCreatedAtDesc = (moments = []) =>
  [...moments].sort((left, right) => {
    const leftTime = Date.parse(left?.createdAt || "") || 0;
    const rightTime = Date.parse(right?.createdAt || "") || 0;
    return rightTime - leftTime;
  });

const loadMoments = async (store) => {
  const stored = await store.get(INDEX_KEY, { type: "json" });
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.map((moment) => normalizeMoment(moment)).filter(Boolean);
};

const saveMoments = async (store, moments) => {
  const sorted = sortByCreatedAtDesc(moments).slice(0, MAX_MOMENTS);
  await store.setJSON(INDEX_KEY, sorted, {
    metadata: {
      updatedAt: new Date().toISOString(),
      count: String(sorted.length),
    },
  });
  return sorted;
};

export default async (request) => {
  if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
    return toJsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const store = getStore({ name: STORE_NAME });

    if (request.method === "GET") {
      const moments = await loadMoments(store);
      return toJsonResponse(200, { moments });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return toJsonResponse(400, { error: "Invalid JSON body" });
    }

    const existing = await loadMoments(store);

    if (request.method === "DELETE") {
      const id = normalizeId(payload?.id || "");
      const ownerId = normalizeId(payload?.ownerId || "");
      if (!id || !ownerId) {
        return toJsonResponse(400, { error: "Missing id or ownerId" });
      }

      const target = existing.find((moment) => moment.id === id);
      if (!target) {
        return toJsonResponse(200, { ok: true, moments: existing });
      }

      const targetOwnerId = normalizeId(target.ownerId || "");
      if (targetOwnerId !== ownerId) {
        return toJsonResponse(403, { error: "Forbidden" });
      }

      const remaining = existing.filter((moment) => moment.id !== id);
      const moments = await saveMoments(store, remaining);
      return toJsonResponse(200, { ok: true, moments });
    }

    const normalized = normalizeMoment(payload, { requireOwnerId: true });
    if (!normalized) {
      return toJsonResponse(400, { error: "Invalid moment payload" });
    }

    const byId = new Map(existing.map((moment) => [moment.id, moment]));
    byId.set(normalized.id, normalized);

    const moments = await saveMoments(store, Array.from(byId.values()));
    return toJsonResponse(200, { ok: true, moments });
  } catch (error) {
    console.error("public-moments error", error);
    return toJsonResponse(500, { error: "Internal error" });
  }
};
