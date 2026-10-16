// covers: AC-3 of spec 0002 (auto lock), for trips the app starts itself (the file picker)
import { AWAY_GRACE_MS, awayGraceMs, whileAway } from '../away';
import { shouldLock } from '../model';

describe('whileAway', () => {
  it('gives the auto lock extra time only while the trip is under way', async () => {
    expect(awayGraceMs()).toBe(0);
    let during = -1;
    await whileAway(async () => {
      during = awayGraceMs();
    });
    expect(during).toBe(AWAY_GRACE_MS);
    expect(awayGraceMs()).toBe(0);
  });

  it('ends the grace even when the trip fails', async () => {
    await expect(
      whileAway(async () => {
        throw new Error('picker busy');
      }),
    ).rejects.toThrow('picker busy');
    expect(awayGraceMs()).toBe(0);
  });

  it('a slow pick does not lock, a forgotten one still does', () => {
    const timeout = 60_000;
    const leftAt = 1_000_000;
    const marker = leftAt + AWAY_GRACE_MS;
    expect(shouldLock(marker, leftAt + 3 * 60_000, timeout)).toBe(false);
    expect(shouldLock(marker, leftAt + AWAY_GRACE_MS + timeout + 1, timeout)).toBe(true);
  });
});
