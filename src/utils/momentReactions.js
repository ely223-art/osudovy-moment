import { getMomentStableId } from './momentIdentity';

const STORAGE_KEY = 'osudovy-moment-reactions';

const normalizeReactionKey = (value = '') => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '');
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

const getReliableExplicitReactionKey = (moment = {}) => {
  const explicitId = normalizeReactionKey(moment?.id || '');
  if (!explicitId) {
    return '';
  }

  if (explicitId === 'legacy-moment' || explicitId === 'legacy-id' || /^legacy(?:-|$)/i.test(explicitId)) {
    return '';
  }

  return explicitId;
};

export const getMomentReactionCandidates = (moment = {}) => {
  const explicitId = getReliableExplicitReactionKey(moment);

  // When a reliable explicit id exists, use only that key to avoid collisions
  // between different moments that happen at the same coordinates.
  if (explicitId) {
    return [explicitId];
  }

  const candidates = [];
  const stableId = getMomentStableId(moment);
  const coordinateKey = normalizeCoordinateReactionKey(moment);

  if (stableId && stableId !== explicitId) {
    candidates.push(stableId);
  }

  if (coordinateKey && coordinateKey !== explicitId && coordinateKey !== stableId) {
    candidates.push(coordinateKey);
  }

  return [...new Set(candidates)];
};

export const getMomentReactionKey = (moment = {}) => getMomentReactionCandidates(moment)[0] || 'legacy-moment';

const getMaxCandidateCount = (source = {}, candidates = []) =>
  candidates.reduce((maxCount, candidate) => {
    const count = Math.max(0, Number(source?.[candidate]?.count) || 0);
    return Math.max(maxCount, count);
  }, 0);

const hasLikedCandidate = (source = {}, candidates = []) =>
  candidates.some((candidate) => Boolean(source?.[candidate]?.liked));

export const resolveLocalMomentReactionState = (reactions = {}, moment = {}) => {
  const candidates = getMomentReactionCandidates(moment);
  const matchingKey = candidates.find((candidate) => reactions[candidate]) || getMomentReactionKey(moment);
  const localState = {
    count: getMaxCandidateCount(reactions, candidates),
    liked: hasLikedCandidate(reactions, candidates),
  };

  return {
    key: matchingKey,
    state: localState,
  };
};

export const clearMomentReactionState = (reactions = {}, moment = {}) => {
  const nextReactions = { ...readMomentReactions(reactions) };
  const candidates = getMomentReactionCandidates(moment);

  candidates.forEach((candidate) => {
    delete nextReactions[candidate];
  });

  return nextReactions;
};

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
  const canonicalKey = getMomentReactionKey(moment);
  const payloadReactions = getMomentPayloadReactions(moment);
  const candidates = getMomentReactionCandidates(moment);
  const payloadKey = candidates.find((candidate) => payloadReactions[candidate]) || '';
  const localKey = candidates.find((candidate) => reactions[candidate]) || '';
  const matchingKey = payloadKey || localKey || canonicalKey;
  const payloadState = {
    count: getMaxCandidateCount(payloadReactions, candidates),
    liked: false,
  };
  const localState = {
    count: getMaxCandidateCount(reactions, candidates),
    liked: hasLikedCandidate(reactions, candidates),
  };
  const hasSharedPayload = Object.prototype.hasOwnProperty.call(moment || {}, 'reactions');
  const hasPayloadState = Boolean(payloadKey && payloadReactions[payloadKey]);
  const hasLocalState = Boolean(localKey && reactions[localKey]);

  // Shared payload drives global count, local storage drives whether this specific device already liked.
  const resolvedState = {
    count: hasSharedPayload ? (hasPayloadState ? payloadState.count : 0) : localState.count,
    liked: hasSharedPayload
      ? (hasPayloadState && payloadState.count > 0 && hasLocalState ? localState.liked : false)
      : (hasLocalState ? localState.liked : false),
  };

  return {
    key: matchingKey,
    state: resolvedState,
  };
};

export const toggleMomentReaction = (reactions = {}, momentIdOrMoment = '') => {
  const isMomentObject = typeof momentIdOrMoment === 'object' && momentIdOrMoment !== null;
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
  const localLikeState = isMomentObject
    ? resolveLocalMomentReactionState(reactions, momentIdOrMoment).state
    : (reactions[canonicalKey] || { liked: false });
  const nextLiked = !Boolean(localLikeState?.liked);
  const nextCount = Math.max(0, (existing.count || 0) + (nextLiked ? 1 : -1));

  const nextReactions = { ...reactions };
  const candidates = isMomentObject ? getMomentReactionCandidates(momentIdOrMoment) : [canonicalKey];

  candidates.forEach((candidate) => {
    delete nextReactions[candidate];
  });

  nextReactions[canonicalKey] = {
    count: nextCount,
    liked: nextLiked,
  };

  return nextReactions;
};
