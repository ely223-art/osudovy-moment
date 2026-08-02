import { getMomentStableId } from './momentIdentity';

const STORAGE_KEY = 'osudovy-moment-reactions';

const normalizeReactionKey = (value = '') => {
  const normalized = String(value || '').trim().replace(/[^a-zA-Z0-9-]/g, '');
  return normalized;
};

export const getMomentReactionKey = (moment = {}) => getMomentStableId(moment);

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
  } catch {
    // ignore storage failures
  }
};

export const toggleMomentReaction = (reactions = {}, momentIdOrMoment = '') => {
  const safeId = typeof momentIdOrMoment === 'object' && momentIdOrMoment !== null
    ? getMomentReactionKey(momentIdOrMoment)
    : normalizeReactionKey(momentIdOrMoment);

  if (!safeId) {
    return reactions;
  }

  const existing = reactions[safeId] || { count: 0, liked: false };
  const nextLiked = !existing.liked;
  const nextCount = Math.max(0, (existing.count || 0) + (nextLiked ? 1 : -1));

  return {
    ...reactions,
    [safeId]: {
      count: nextCount,
      liked: nextLiked,
    },
  };
};
