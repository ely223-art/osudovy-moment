import { describe, expect, it, vi } from 'vitest';
import { getMomentStableId } from './momentIdentity';
import { getMomentReactionKey, readMomentReactions, saveMomentReactions, toggleMomentReaction } from './momentReactions';

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
