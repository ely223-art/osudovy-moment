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
const normalizeText = (value = "") => {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  return text
    .replace(/\u00e3\u0081/g, 'á')
    .replace(/\u00c5\u0091/g, 'ń')
    .replace(/\u00c5\u009b/g, 'ż')
    .replace(/\u00c4\u008d/g, 'č')
    .replace(/\u00c4\u0099/g, 'ď')
    .replace(/\u00c4\u008e/g, 'ě')
    .replace(/\u00c3\u00ad/g, 'í')
    .replace(/\u00c4\u008f/g, 'ě')
    .replace(/\u00c5\u008f/g, 'ř')
    .replace(/\u00c5\u009a/g, 'š')
    .replace(/\u00c5\u0099/g, 'ť')
    .replace(/\u00c5\u00af/g, 'ů')
    .replace(/\u00c5\u00bd/g, 'ž')
    .replace(/\u00c3\u00a1/g, 'á')
    .replace(/\u00c3\u00a9/g, 'é')
    .replace(/\u00c3\u00ad/g, 'í')
    .replace(/\u00c3\u00b3/g, 'ó')
    .replace(/\u00c3\u00ba/g, 'ú')
    .replace(/\u00c3\u00bd/g, 'ý')
    .replace(/\u00c4\u0081/g, 'Ă')
    .replace(/\u00c4\u0082/g, 'Ă')
    .replace(/\u00c4\u0083/g, 'ă')
    .replace(/\u00c4\u0084/g, 'Ä')
    .replace(/\u00c4\u0085/g, 'ą')
    .replace(/\u00c4\u0086/g, 'Ć')
    .replace(/\u00c4\u0087/g, 'ć')
    .replace(/\u00c4\u0088/g, 'Ĉ')
    .replace(/\u00c4\u0089/g, 'ĉ')
    .replace(/\u00c4\u008a/g, 'Ċ')
    .replace(/\u00c4\u008b/g, 'ċ')
    .replace(/\u00c4\u008c/g, 'Č')
    .replace(/\u00c4\u008d/g, 'č')
    .replace(/\u00c4\u008e/g, 'Ď')
    .replace(/\u00c4\u008f/g, 'ď')
    .replace(/\u00c4\u0090/g, 'Đ')
    .replace(/\u00c4\u0091/g, 'đ')
    .replace(/\u00c4\u0092/g, 'Ē')
    .replace(/\u00c4\u0093/g, 'ē')
    .replace(/\u00c4\u0094/g, 'Ĕ')
    .replace(/\u00c4\u0095/g, 'ĕ')
    .replace(/\u00c4\u0096/g, 'Ė')
    .replace(/\u00c4\u0097/g, 'ė')
    .replace(/\u00c4\u0098/g, 'Ę')
    .replace(/\u00c4\u0099/g, 'ę')
    .replace(/\u00c4\u009a/g, 'Ě')
    .replace(/\u00c4\u009b/g, 'ě')
    .replace(/\u00c4\u009c/g, 'Ĝ')
    .replace(/\u00c4\u009d/g, 'ĝ')
    .replace(/\u00c4\u009e/g, 'Ğ')
    .replace(/\u00c4\u009f/g, 'ğ')
    .replace(/\u00c4\u00a0/g, 'Ġ')
    .replace(/\u00c4\u00a1/g, 'ġ')
    .replace(/\u00c4\u00a2/g, 'Ģ')
    .replace(/\u00c4\u00a3/g, 'ģ')
    .replace(/\u00c4\u00a4/g, 'Ĥ')
    .replace(/\u00c4\u00a5/g, 'ĥ')
    .replace(/\u00c4\u00a6/g, 'Ħ')
    .replace(/\u00c4\u00a7/g, 'ħ')
    .replace(/\u00c4\u00a8/g, 'Ĩ')
    .replace(/\u00c4\u00a9/g, 'ĩ')
    .replace(/\u00c4\u00aa/g, 'Ī')
    .replace(/\u00c4\u00ab/g, 'ī')
    .replace(/\u00c4\u00ac/g, 'Ĭ')
    .replace(/\u00c4\u00ad/g, 'ĭ')
    .replace(/\u00c4\u00ae/g, 'Į')
    .replace(/\u00c4\u00af/g, 'į')
    .replace(/\u00c4\u00b0/g, 'İ')
    .replace(/\u00c4\u00b1/g, 'ı')
    .replace(/\u00c4\u00b2/g, 'Ĳ')
    .replace(/\u00c4\u00b3/g, 'ĳ')
    .replace(/\u00c4\u00b4/g, 'Ĵ')
    .replace(/\u00c4\u00b5/g, 'ĵ')
    .replace(/\u00c4\u00b6/g, 'Ķ')
    .replace(/\u00c4\u00b7/g, 'ķ')
    .replace(/\u00c4\u00b8/g, 'ĸ')
    .replace(/\u00c4\u00b9/g, 'Ĺ')
    .replace(/\u00c4\u00ba/g, 'ĺ')
    .replace(/\u00c4\u00bb/g, 'Ļ')
    .replace(/\u00c4\u00bc/g, 'ļ')
    .replace(/\u00c4\u00bd/g, 'Ľ')
    .replace(/\u00c4\u00be/g, 'ľ')
    .replace(/\u00c4\u00bf/g, 'Ŀ')
    .replace(/\u00c5\u0080/g, 'ŀ')
    .replace(/\u00c5\u0081/g, 'Ł')
    .replace(/\u00c5\u0082/g, 'ł')
    .replace(/\u00c5\u0083/g, 'Ń')
    .replace(/\u00c5\u0084/g, 'ń')
    .replace(/\u00c5\u0085/g, 'Ņ')
    .replace(/\u00c5\u0086/g, 'ņ')
    .replace(/\u00c5\u0087/g, 'Ň')
    .replace(/\u00c5\u0088/g, 'ň')
    .replace(/\u00c5\u0089/g, 'ŉ')
    .replace(/\u00c5\u008a/g, 'Ŋ')
    .replace(/\u00c5\u008b/g, 'ŋ')
    .replace(/\u00c5\u008c/g, 'Ō')
    .replace(/\u00c5\u008d/g, 'ō')
    .replace(/\u00c5\u008e/g, 'Ŏ')
    .replace(/\u00c5\u008f/g, 'ŏ')
    .replace(/\u00c5\u0090/g, 'Ő')
    .replace(/\u00c5\u0091/g, 'ő')
    .replace(/\u00c5\u0092/g, 'Œ')
    .replace(/\u00c5\u0093/g, 'œ')
    .replace(/\u00c5\u0094/g, 'Ŕ')
    .replace(/\u00c5\u0095/g, 'ŕ')
    .replace(/\u00c5\u0096/g, 'Ŗ')
    .replace(/\u00c5\u0097/g, 'ŗ')
    .replace(/\u00c5\u0098/g, 'Ř')
    .replace(/\u00c5\u0099/g, 'ř')
    .replace(/\u00c5\u009a/g, 'Ś')
    .replace(/\u00c5\u009b/g, 'ś')
    .replace(/\u00c5\u009c/g, 'Ŝ')
    .replace(/\u00c5\u009d/g, 'ŝ')
    .replace(/\u00c5\u009e/g, 'Ş')
    .replace(/\u00c5\u009f/g, 'ş')
    .replace(/\u00c5\u00a0/g, 'Š')
    .replace(/\u00c5\u00a1/g, 'š')
    .replace(/\u00c5\u00a2/g, 'Ţ')
    .replace(/\u00c5\u00a3/g, 'ţ')
    .replace(/\u00c5\u00a4/g, 'Ť')
    .replace(/\u00c5\u00a5/g, 'ť')
    .replace(/\u00c5\u00a6/g, 'Ŧ')
    .replace(/\u00c5\u00a7/g, 'ŧ')
    .replace(/\u00c5\u00a8/g, 'Ũ')
    .replace(/\u00c5\u00a9/g, 'ũ')
    .replace(/\u00c5\u00aa/g, 'Ū')
    .replace(/\u00c5\u00ab/g, 'ū')
    .replace(/\u00c5\u00ac/g, 'Ŭ')
    .replace(/\u00c5\u00ad/g, 'ŭ')
    .replace(/\u00c5\u00ae/g, 'Ů')
    .replace(/\u00c5\u00af/g, 'ů')
    .replace(/\u00c5\u00b0/g, 'Ű')
    .replace(/\u00c5\u00b1/g, 'ű')
    .replace(/\u00c5\u00b2/g, 'Ų')
    .replace(/\u00c5\u00b3/g, 'ų')
    .replace(/\u00c5\u00b4/g, 'Ŵ')
    .replace(/\u00c5\u00b5/g, 'ŵ')
    .replace(/\u00c5\u00b6/g, 'Ŷ')
    .replace(/\u00c5\u00b7/g, 'ŷ')
    .replace(/\u00c5\u00b8/g, 'Ÿ')
    .replace(/\u00c5\u00b9/g, 'Ź')
    .replace(/\u00c5\u00ba/g, 'ź')
    .replace(/\u00c5\u00bb/g, 'Ż')
    .replace(/\u00c5\u00bc/g, 'ż')
    .replace(/\u00c5\u00bd/g, 'Ž')
    .replace(/\u00c5\u00be/g, 'ž')
    .replace(/\u00c5\u00bf/g, 'ſ');
};
const normalizeMomentKey = (value = "") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/[^a-zA-Z0-9-_.]/g, "");
};

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

const normalizeReactionKey = (value = '') => String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '');

const normalizeReactions = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, reaction]) => Boolean(key) && reaction && typeof reaction === 'object' && !Array.isArray(reaction))
      .map(([key, reaction]) => [normalizeReactionKey(key), normalizeReactionState(reaction)])
  );
};

const normalizeTextKey = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isKnownKdyneMoment = (moment = {}) => {
  const normalizedId = normalizeId(moment?.id || '');
  if (normalizedId === '1785664076458') {
    return true;
  }

  return (
    normalizeTextKey(moment?.obec) === 'kdyne'
    && normalizeTextKey(moment?.datum) === '2004-07-22'
    && normalizeTextKey(moment?.nazev).includes('osudove setkani')
  );
};

const repairKnownMomentText = (moment = {}) => {
  if (!isKnownKdyneMoment(moment)) {
    return moment;
  }

  return {
    ...moment,
    obec: 'Kdyně',
    okres: 'Domažlice',
    kraj: 'Plzeňský kraj',
    symbolLabel: 'Láska',
    nazev: 'Osudové setkání',
    prikaz: 'Tady jsem se seznámila se svým budoucím mužem ❤️ Po 11ti letech vztahu a jednom dítěti mi zemřel 😢',
  };
};

const normalizeMoment = (moment = {}, options = {}) => {
  const { requireOwnerId = false } = options;
  const originalId = String(moment?.id || "").trim();
  const id = normalizeId(originalId) || normalizeMomentKey(originalId) || `moment-${Date.now()}`;
  const ownerId = normalizeId(moment?.ownerId || "") || normalizeId(originalId) || id;
  const latitude = parseCoordinate(moment?.latitude);
  const longitude = parseCoordinate(moment?.longitude);

  if (!id || (requireOwnerId && !ownerId) || latitude === null || longitude === null) {
    return null;
  }

  return repairKnownMomentText({
    id,
    ownerId,
    originalId: originalId || id,
    obec: normalizeText(moment?.obec).slice(0, 120),
    okres: normalizeText(moment?.okres).slice(0, 120),
    kraj: normalizeText(moment?.kraj).slice(0, 120),
    stat: normalizeText(moment?.stat).slice(0, 120),
    latitude,
    longitude,
    symbolType: normalizeText(moment?.symbolType).slice(0, 60),
    symbolImage: normalizeText(moment?.symbolImage).slice(0, 400),
    symbolLabel: normalizeText(moment?.symbolLabel).slice(0, 100),
    nazev: normalizeText(moment?.nazev).slice(0, 180),
    prikaz: normalizeText(moment?.prikaz).slice(0, 500),
    datum: normalizeText(moment?.datum).slice(0, 30),
    createdAt: String(moment?.createdAt || new Date().toISOString()).slice(0, 64),
    reactions: normalizeReactions(moment?.reactions),
  });
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

    if (request.method === "POST" && payload?.resetAllReactions === true) {
      const resetMoments = existing.map((moment) => ({
        ...moment,
        reactions: {},
      }));
      const moments = await saveMoments(store, resetMoments);
      return toJsonResponse(200, { ok: true, moments, reset: true });
    }

    if (request.method === "POST" && payload?.setReactionCount === true) {
      const targetId = normalizeId(payload?.id || "");
      const nextCount = Math.max(0, Number(payload?.count) || 0);
      if (!targetId) {
        return toJsonResponse(400, { error: "Missing id" });
      }

      const updatedMoments = existing.map((moment) => {
        if (moment.id !== targetId && moment.originalId !== targetId) {
          return moment;
        }

        return {
          ...moment,
          reactions: nextCount > 0
            ? {
              [moment.id]: { count: nextCount, liked: false },
            }
            : {},
        };
      });

      const moments = await saveMoments(store, updatedMoments);
      return toJsonResponse(200, { ok: true, moments, updated: true });
    }

    if (request.method === "DELETE") {
      const id = normalizeId(payload?.id || "");
      const ownerId = normalizeId(payload?.ownerId || "");
      if (!id || !ownerId) {
        return toJsonResponse(400, { error: "Missing id or ownerId" });
      }

      const target = existing.find((moment) => moment.id === id || moment.originalId === id);
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
    const matchingExisting = existing.find((moment) => moment.id === normalized.id || moment.originalId === normalized.originalId);
    if (matchingExisting) {
      byId.set(matchingExisting.id, {
        ...matchingExisting,
        ...normalized,
        id: matchingExisting.id,
        originalId: matchingExisting.originalId || normalized.originalId,
      });
    } else {
      byId.set(normalized.id, normalized);
    }

    const moments = await saveMoments(store, Array.from(byId.values()));
    return toJsonResponse(200, { ok: true, moments });
  } catch (error) {
    console.error("public-moments error", error);
    return toJsonResponse(500, { error: "Internal error" });
  }
};
