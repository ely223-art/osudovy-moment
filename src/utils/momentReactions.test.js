import { describe, expect, it, vi } from 'vitest';
import { getMomentStableId } from './momentIdentity';
import { clearMomentReactionState, getMomentReactionKey, readMomentReactions, resolveLocalMomentReactionState, resolveMomentReactionState, saveMomentReactions, toggleMomentReaction } from './momentReactions';

describe('moment reactions', () => {
  it('adds a like for a moment that was not liked yet', () => {
    const reactions = readMomentReactions({});
    const next = toggleMomentReaction(reactions, 'moment-1');

    expect(next['moment-1']).toEqual({ count: 1, liked: true });
  });

  it('removes the like when the same moment is toggled again', () => {
    const reactions = readMomentReactions({ 'moment-1': { count: 1, liked: true } });
    const next = toggleMomentReaction(reactions, 'moment-1');

    expect(next['moment-1']).toEqual({ count: 0, liked: false });
  });

  it('creates a stable reaction key for legacy moments without a normal id', () => {
    const moment = {
      nazev: 'Starý moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const reactionKey = getMomentReactionKey(moment);
    const reactions = readMomentReactions({});
    const next = toggleMomentReaction(reactions, moment);

    expect(reactionKey).toBeTruthy();
    expect(next[reactionKey]).toEqual({ count: 1, liked: true });
  });

  it('creates a stable fallback id from coordinates for legacy moments even when an explicit id exists', () => {
    const moment = {
      id: 'legacy-id',
      nazev: 'Starý moment',
      latitude: 50.08,
      longitude: 14.42,
      obec: 'Bělčice',
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const stableId = getMomentStableId(moment);

    expect(stableId).toBeTruthy();
    expect(stableId).not.toBe('legacy-id');
    expect(stableId).toContain('5008000');
  });

  it('reads shared count from payload but keeps liked device-local', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'shared-moment': { count: 2, liked: true },
      },
    };

    const resolved = resolveMomentReactionState({}, moment);

    expect(resolved.state).toEqual({ count: 2, liked: false });
  });

  it('ignores fallback payload keys when a reliable explicit id exists', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'coords-50.08000-14.42000': { count: 3, liked: true },
      },
    };

    const resolved = resolveMomentReactionState({}, moment);

    expect(resolved.state).toEqual({ count: 0, liked: false });
  });

  it('prefers server payload count over stale local state for shared updates', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'shared-moment': { count: 2, liked: true },
      },
    };

    const resolved = resolveMomentReactionState({ 'shared-moment': { count: 0, liked: false } }, moment);

    expect(resolved.state).toEqual({ count: 2, liked: false });
  });

  it('does not treat payload liked=true as liked on a new device', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'shared-moment': { count: 2, liked: true },
      },
    };

    const resolved = resolveMomentReactionState({}, moment);

    expect(resolved.state).toEqual({ count: 2, liked: false });
  });

  it('increments shared count on first like from a different device', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'shared-moment': { count: 2, liked: true },
      },
    };

    const next = toggleMomentReaction({}, moment);

    expect(next['shared-moment']).toEqual({ count: 3, liked: true });
  });

  it('treats a shared moment with empty payload as reset to zero likes', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {},
    };

    const resolved = resolveMomentReactionState({ 'shared-moment': { count: 5, liked: true } }, moment);

    expect(resolved.state).toEqual({ count: 0, liked: false });
  });

  it('clears only explicit-id local key when shared state is reset', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const cleared = clearMomentReactionState({
      'shared-moment': { count: 5, liked: true },
      'coords-50.08000-14.42000': { count: 5, liked: true },
      other: { count: 1, liked: true },
    }, moment);

    expect(cleared['shared-moment']).toBeUndefined();
    expect(cleared['coords-50.08000-14.42000']).toEqual({ count: 5, liked: true });
    expect(cleared.other).toEqual({ count: 1, liked: true });
  });

  it('uses explicit-id state even when fallback local key differs', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
      reactions: {
        'shared-moment': { count: 1, liked: false },
      },
    };

    const localReactions = {
      'coords-50.08000-14.42000': { count: 1, liked: true },
    };

    const resolved = resolveMomentReactionState(localReactions, moment);
    const next = toggleMomentReaction(localReactions, moment);

    expect(resolved.state).toEqual({ count: 1, liked: false });
    expect(next['shared-moment']).toEqual({ count: 2, liked: true });
  });

  it('reads local liked state directly even when the shared payload is empty', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {},
    };

    const resolved = resolveLocalMomentReactionState({
      'shared-moment': { count: 1, liked: true },
    }, moment);

    expect(resolved.state).toEqual({ count: 1, liked: true });
  });

  it('does not treat fallback liked=true as explicit-id liked=true', () => {
    const moment = {
      id: 'shared-moment',
      latitude: 50.08,
      longitude: 14.42,
      reactions: {
        'shared-moment': { count: 1, liked: false },
      },
    };

    const localReactions = {
      'shared-moment': { count: 1, liked: false },
      'coords-50.08000-14.42000': { count: 1, liked: true },
    };

    const resolved = resolveMomentReactionState(localReactions, moment);
    const next = toggleMomentReaction(localReactions, moment);

    expect(resolved.state).toEqual({ count: 1, liked: false });
    expect(next['shared-moment']).toEqual({ count: 2, liked: true });
  });

  it('does not share likes between different explicit-id moments on same coordinates', () => {
    const firstMoment = {
      id: 'moment-a',
      latitude: 49.50241,
      longitude: 13.87575,
      obec: 'Bělčice',
      createdAt: '2026-08-01T18:54:10.532Z',
    };

    const secondMoment = {
      id: 'moment-b',
      latitude: 49.50241,
      longitude: 13.87575,
      obec: 'Bělčice',
      createdAt: '2026-08-01T17:37:08.756Z',
    };

    const firstLiked = toggleMomentReaction({}, firstMoment);
    const secondState = resolveMomentReactionState(firstLiked, secondMoment);

    expect(firstLiked['moment-a']).toEqual({ count: 1, liked: true });
    expect(firstLiked['moment-b']).toBeUndefined();
    expect(secondState.state).toEqual({ count: 0, liked: false });
  });

  it('keeps reaction state aligned for legacy moments even when the payload shape changes', () => {
    const olderMoment = {
      nazev: 'Starý moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
    };
    const newerMoment = {
      id: 'legacy-1',
      nazev: 'Starý moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    const reactions = toggleMomentReaction({}, olderMoment);
    const next = toggleMomentReaction(reactions, newerMoment);
    const stableKey = getMomentReactionKey(newerMoment);

    expect(next[stableKey]).toEqual({ count: 0, liked: false });
    expect(next['legacy-1']).toBeUndefined();
  });

  it('notifies listeners when reactions are saved', () => {
    const listener = vi.fn();
    const listeners = new Map();
    const mockWindow = {
      addEventListener: vi.fn((eventName, handler) => {
        listeners.set(eventName, handler);
      }),
      removeEventListener: vi.fn((eventName, handler) => {
        if (listeners.get(eventName) === handler) {
          listeners.delete(eventName);
        }
      }),
      dispatchEvent: vi.fn((event) => {
        const handler = listeners.get(event.type);
        if (handler) {
          handler(event);
        }
        return true;
      }),
      localStorage: {
        setItem: vi.fn(),
        getItem: vi.fn(),
      },
    };

    vi.stubGlobal('window', mockWindow);
    mockWindow.addEventListener('moment-reactions-updated', listener);

    saveMomentReactions({ 'moment-1': { count: 1, liked: true } });

    expect(listener).toHaveBeenCalled();
    mockWindow.removeEventListener('moment-reactions-updated', listener);
    vi.unstubAllGlobals();
  });
});
