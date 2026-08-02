import { getMomentStableId } from './momentIdentity';

// Versioned key forces a one-time global reset of previously stored device likes.
const STORAGE_KEY = 'osudovy-moment-reactions-v2-reset-20260802';

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
  const candidates = getMomentReactionCandidates(moment);
  const localKey = candidates.find((candidate) => reactions[candidate]) || '';
  const matchingKey = localKey || canonicalKey;
  const localState = {
    count: getMaxCandidateCount(reactions, candidates),
    liked: hasLikedCandidate(reactions, candidates),
  };
  const hasLocalState = Boolean(localKey && reactions[localKey]);

  return {
    key: matchingKey,
    state: {
      count: localState.count,
      liked: hasLocalState ? localState.liked : false,
    },
  };
};

export const mergeMomentReactionState = (reactions = {}, moment = {}) => {
  const nextReactions = clearMomentReactionState(reactions, moment);
  const localReaction = resolveLocalMomentReactionState(reactions, moment);
  const hasLocalState = Boolean(localReaction?.key && (localReaction.state.count > 0 || localReaction.state.liked));

  if (!hasLocalState) {
    return nextReactions;
  }

  nextReactions[localReaction.key] = {
    count: Math.max(0, Number(localReaction.state.count) || 0),
    liked: Boolean(localReaction.state.liked),
  };

  return nextReactions;
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

  const localLikeState = isMomentObject
    ? resolveLocalMomentReactionState(reactions, momentIdOrMoment).state
    : (reactions[canonicalKey] || { liked: false });
  // Enforce one irreversible like per device for each moment.
  if (Boolean(localLikeState?.liked)) {
    return reactions;
  }

  const nextLiked = true;
  const nextCount = 1;

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
