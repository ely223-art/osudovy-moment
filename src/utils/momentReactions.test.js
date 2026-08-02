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

  it('creates a stable fallback id for legacy moments', () => {
    const moment = {
      nazev: 'Starý moment',
      latitude: 50.08,
      longitude: 14.42,
      createdAt: '2020-01-01T00:00:00.000Z',
    };

    expect(getMomentStableId(moment)).toBeTruthy();
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

    expect(next[ 'coords-50.08000-14.42000' ]).toEqual({ count: 0, liked: false });
    expect(next['legacy-1']).toEqual({ count: 0, liked: false });
  });

  it('notifies listeners when reactions are saved', () => {
    const listener = vi.fn();
    window.addEventListener('moment-reactions-updated', listener);

    saveMomentReactions({ 'moment-1': { count: 1, liked: true } });

    expect(listener).toHaveBeenCalled();
    window.removeEventListener('moment-reactions-updated', listener);
  });
});
