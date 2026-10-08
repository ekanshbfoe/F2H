// covers: AC-4 (backoff schedule), AC-15 (PIN rules), AC-3 (timeout decision), attempt entry parsing
import {
  describeWipe,
  parseAttempts,
  pinProblem,
  scheduleFor,
  serializeAttempts,
  shouldLock,
  isTimeoutOption,
} from '../model';

describe('backoff schedule (AC-4)', () => {
  it('is free for misses 1 to 4 and grows from the fifth', () => {
    expect([1, 2, 3, 4].map(scheduleFor)).toEqual([0, 0, 0, 0]);
    expect(scheduleFor(5)).toBe(30_000);
    expect(scheduleFor(6)).toBe(60_000);
    expect(scheduleFor(7)).toBe(120_000);
    expect(scheduleFor(8)).toBe(300_000);
    expect(scheduleFor(9)).toBe(900_000);
    expect(scheduleFor(0)).toBe(0);
  });
});

describe('PIN rules (AC-15)', () => {
  it('refuses the wrong length and non digits', () => {
    expect(pinProblem('12345')).toBe('length');
    expect(pinProblem('1234567')).toBe('length');
    expect(pinProblem('12a456')).toBe('length');
  });
  it('refuses six identical digits', () => {
    expect(pinProblem('000000')).toBe('repeated');
    expect(pinProblem('777777')).toBe('repeated');
  });
  it('refuses straight runs up or down', () => {
    expect(pinProblem('123456')).toBe('sequence');
    expect(pinProblem('456789')).toBe('sequence');
    expect(pinProblem('987654')).toBe('sequence');
    expect(pinProblem('543210')).toBe('sequence');
  });
  it('accepts an ordinary PIN', () => {
    expect(pinProblem('482913')).toBeNull();
    expect(pinProblem('112233')).toBeNull();
    expect(pinProblem('135790')).toBeNull();
  });
});

describe('attempt entry', () => {
  it('round trips and clamps', () => {
    expect(parseAttempts(null)).toEqual({ failures: 0, remainingMs: 0 });
    expect(parseAttempts(serializeAttempts({ failures: 5, remainingMs: 12_345.6 }))).toEqual({
      failures: 5,
      remainingMs: 12_346,
    });
    expect(parseAttempts(JSON.stringify({ failures: -2, remainingMs: -5 }))).toEqual({
      failures: 0,
      remainingMs: 0,
    });
  });
  it('reads an unreadable entry as the worst case', () => {
    expect(parseAttempts('{not json').failures).toBe(10);
  });
});

describe('timeout decision (AC-3)', () => {
  it('locks only when the app was away longer than the timeout', () => {
    expect(shouldLock(1000, 1000 + 59_000, 60_000)).toBe(false);
    expect(shouldLock(1000, 1000 + 60_000, 60_000)).toBe(false);
    expect(shouldLock(1000, 1000 + 61_000, 60_000)).toBe(true);
    expect(shouldLock(null, 999_999, 15_000)).toBe(false);
  });
  it('knows the four timeout options', () => {
    expect([15_000, 60_000, 300_000, 900_000].every(isTimeoutOption)).toBe(true);
    expect(isTimeoutOption(30_000)).toBe(false);
  });
});

describe('wiped copy', () => {
  it('has distinct copy per reason and a default', () => {
    const titles = new Set(
      ['pin_limit', 'forgot', 'revoked', undefined].map((r) => describeWipe(r).title),
    );
    expect(titles.size).toBe(3);
    expect(describeWipe('garbage').title).toBe(describeWipe('pin_limit').title);
  });
});
