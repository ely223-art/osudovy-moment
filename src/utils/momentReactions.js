import { getMomentStableId } from './momentIdentity';

const STORAGE_KEY = 'osudovy-moment-reactions';

const normalizeReactionKey = (value = '') => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');
  return normalized;
};

const normalizeReactionStateValue = (value = {}) => {
  const normalized = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return {
    count: Math.max(0, Number(normalized?.count) || 0),
    liked: Boolean(normalized?.liked),
  };
};

const normalizeCoordinateReactionKey = (moment = {}) => {
  const latitude = Number(moment?.latitude);
  const longitude = Number(moment?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }

  return `coords-${latitude.toFixed(5)}-${longitude.toFixed(5)}`;
};

export const getMomentReactionCandidates = (moment = {}) => {
  const candidates = [];

  const stableId = getMomentStableId(moment);
  if (stableId) {
    candidates.push(stableId);
  }

  const coordinateKey = normalizeCoordinateReactionKey(moment);
  if (coordinateKey) {
    candidates.push(coordinateKey);
  }

  const explicitId = normalizeReactionKey(moment?.id || '');
  if (explicitId && explicitId !== stableId) {
    candidates.push(explicitId);
  }

  return [...new Set(candidates)];
};

export const getMomentReactionKey = (moment = {}) => getMomentReactionCandidates(moment)[0] || 'legacy-moment';

export const getMomentPayloadReactions = (moment = {}) => {
  const candidate = moment?.reactions;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(candidate)
      .filter(([key, value]) => Boolean(key) && value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => [normalizeReactionKey(key), normalizeReactionStateValue(value)])
  );
};

export const readMomentReactions = (source = {}) => {
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return source;
  }

  return {};
};

export const loadMomentReactions = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    return readMomentReactions(parsed);
  } catch {
    return {};
  }
};

export const saveMomentReactions = (reactions = {}) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reactions));
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('moment-reactions-updated', { detail: reactions }));
    }
  } catch {
    // ignore storage failures
  }
};

export const resolveMomentReactionState = (reactions = {}, moment = {}) => {
  const candidates = getMomentReactionCandidates(moment);
  const payloadReactions = getMomentPayloadReactions(moment);
  const mergedReactions = { ...payloadReactions, ...reactions };
  const matchingKey = candidates.find((candidate) => mergedReactions[candidate]);
  const canonicalKey = getMomentReactionKey(moment);

  if (!matchingKey) {
    return {
      key: canonicalKey,
      state: { count: 0, liked: false },
    };
  }

  return {
    key: matchingKey,
    state: mergedReactions[matchingKey] || { count: 0, liked: false },
  };
};

export const toggleMomentReaction = (reactions = {}, momentIdOrMoment = '') => {
  const isMomentObject = typeof momentIdOrMoment === 'object' && momentIdOrMoment !== null;
  const candidates = isMomentObject ? getMomentReactionCandidates(momentIdOrMoment) : [];
  const explicitId = !isMomentObject ? normalizeReactionKey(momentIdOrMoment) : '';
  const canonicalKey = isMomentObject ? getMomentReactionKey(momentIdOrMoment) : explicitId;

  if (!canonicalKey) {
    return reactions;
  }

  const resolvedState = isMomentObject ? resolveMomentReactionState(reactions, momentIdOrMoment) : {
    key: canonicalKey,
    state: reactions[canonicalKey] || { count: 0, liked: false },
  };

  const existing = resolvedState.state || { count: 0, liked: false };
  const nextLiked = !existing.liked;
  const nextCount = Math.max(0, (existing.count || 0) + (nextLiked ? 1 : -1));

  const nextReactions = { ...reactions };
  if (resolvedState.key && resolvedState.key !== canonicalKey) {
    delete nextReactions[resolvedState.key];
  }

  candidates.forEach((candidate) => {
    delete nextReactions[candidate];
  });

  nextReactions[canonicalKey] = {
    count: nextCount,
    liked: nextLiked,
  };

  return nextReactions;
};
