const {
  WAGE_LEVEL_MIN,
  WAGE_LEVEL_MAX,
  WAGE_LEVEL_DEFAULT,
  BULK_WAGE_MAX_PER_WINDOW,
  BULK_WAGE_WINDOW_MS,
  clampWageLevel,
  formatWageLevel,
  validateCanAdjustWages,
  bulkSetWageLevel,
  estimateBulkWageDurationMs,
  formatDuration,
} = require('../../src/corporation-wages');

/**
 * Virtual clock so pacing behaviour is asserted deterministically and the
 * suite stays fast — a 105-sector run covers five simulated minutes.
 */
function makeClock() {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: (ms) => {
      t += Math.max(0, ms);
      return Promise.resolve();
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

/** Build N sector stubs. */
function sectors(n) {
  return Array.from({ length: n }, (_, i) => ({ _id: `sector${i}` }));
}

describe('corporation-wages', () => {
  // --- Constants mirror the server ---

  test('wage bounds mirror AHDGame laborCost.ts', () => {
    expect(WAGE_LEVEL_MIN).toBe(0.8);
    expect(WAGE_LEVEL_MAX).toBe(1.5);
    expect(WAGE_LEVEL_DEFAULT).toBe(1.0);
  });

  test('rate-limit budget mirrors setSectorWageLevel.ts', () => {
    expect(BULK_WAGE_MAX_PER_WINDOW).toBe(20);
    expect(BULK_WAGE_WINDOW_MS).toBe(60000);
  });

  // --- clampWageLevel ---

  test.each([
    [0.7, 0.8],
    [2.0, 1.5],
    [1.1, 1.1],
    [0.8, 0.8],
    [1.5, 1.5],
  ])('clampWageLevel(%p) -> %p', (input, expected) => {
    expect(clampWageLevel(input)).toBe(expected);
  });

  test('clampWageLevel returns the default for non-finite input', () => {
    // Matches the server helper exactly: Infinity is not finite, so it falls
    // back to the 1.0 baseline rather than clamping up to the maximum.
    expect(clampWageLevel(NaN)).toBe(1.0);
    expect(clampWageLevel(Infinity)).toBe(1.0);
    expect(clampWageLevel(-Infinity)).toBe(1.0);
    expect(clampWageLevel(undefined)).toBe(1.0);
  });

  test('formatWageLevel renders two decimals and clamps', () => {
    expect(formatWageLevel(1)).toBe('1.00x');
    expect(formatWageLevel(0.85)).toBe('0.85x');
    expect(formatWageLevel(9)).toBe('1.50x');
  });

  // --- validateCanAdjustWages ---

  test('rejects when there is no character', () => {
    expect(validateCanAdjustWages(null).ok).toBe(false);
    expect(validateCanAdjustWages({ hasCharacter: false }).ok).toBe(false);
  });

  test('rejects a non-CEO', () => {
    const r = validateCanAdjustWages({ hasCharacter: true, isCeo: false });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CEO/);
  });

  test('rejects a CEO with no corporation id', () => {
    expect(validateCanAdjustWages({ hasCharacter: true, isCeo: true }).ok).toBe(
      false,
    );
    expect(
      validateCanAdjustWages({
        hasCharacter: true,
        isCeo: true,
        myCorporationId: '   ',
      }).ok,
    ).toBe(false);
  });

  test('accepts a CEO and stringifies a numeric corporation id', () => {
    const r = validateCanAdjustWages({
      hasCharacter: true,
      isCeo: true,
      myCorporationId: 123,
    });
    expect(r).toEqual({ ok: true, corporationId: '123' });
  });

  // --- bulkSetWageLevel: contract ---

  test('throws when required deps are missing', async () => {
    await expect(bulkSetWageLevel({ gameUrl: 'x' })).rejects.toThrow(
      /missing required deps/,
    );
  });

  test('returns a zero result when the corporation has no sectors', async () => {
    const result = await bulkSetWageLevel({
      gameUrl: 'http://g',
      corporationId: '1',
      wageLevel: 1.2,
      setOne: jest.fn(),
      listSectors: () => Promise.resolve([]),
    });
    expect(result).toMatchObject({ total: 0, succeeded: 0, failed: 0 });
  });

  test('clamps the level before writing it', async () => {
    const setOne = jest.fn().mockResolvedValue({ ok: true, statusCode: 200 });
    const result = await bulkSetWageLevel({
      gameUrl: 'http://g',
      corporationId: '1',
      wageLevel: 99,
      setOne,
      listSectors: () => Promise.resolve(sectors(1)),
    });
    expect(setOne).toHaveBeenCalledWith('1', 'sector0', 1.5);
    expect(result.clamped).toBe(1.5);
  });

  // --- bulkSetWageLevel: pacing (the actual defect) ---

  test('a corp at the window budget never waits', async () => {
    const clock = makeClock();
    const sleep = jest.fn(clock.sleep);
    const setOne = jest.fn().mockResolvedValue({ ok: true, statusCode: 200 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(20)),
      },
      { sleep, now: clock.now },
    );

    expect(result.succeeded).toBe(20);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('never starts more than 20 requests inside any 60s window', async () => {
    const clock = makeClock();
    const starts = [];
    const setOne = jest.fn(() => {
      starts.push(clock.now());
      return Promise.resolve({ ok: true, statusCode: 200 });
    });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(105)),
      },
      { sleep: clock.sleep, now: clock.now },
    );

    expect(result.succeeded).toBe(105);
    expect(result.failed).toBe(0);

    // For every request, count how many others started within the preceding
    // 60s. The server's fixed window can never see more than our rolling one.
    for (let i = 0; i < starts.length; i++) {
      const windowStart = starts[i] - BULK_WAGE_WINDOW_MS;
      const inWindow = starts.filter(
        (t, j) => j <= i && t > windowStart,
      ).length;
      expect(inWindow).toBeLessThanOrEqual(BULK_WAGE_MAX_PER_WINDOW);
    }
  });

  test('a 105-sector corp completes rather than shredding against the limiter', async () => {
    const clock = makeClock();
    const setOne = jest.fn().mockResolvedValue({ ok: true, statusCode: 200 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 0.9,
        setOne,
        listSectors: () => Promise.resolve(sectors(105)),
      },
      { sleep: clock.sleep, now: clock.now },
    );

    expect(setOne).toHaveBeenCalledTimes(105);
    expect(result).toMatchObject({ total: 105, succeeded: 105, failed: 0 });
  });

  // --- bulkSetWageLevel: 429 handling ---

  test('honours Retry-After on 429 and retries the sector', async () => {
    const clock = makeClock();
    const sleep = jest.fn(clock.sleep);
    const setOne = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, statusCode: 429, retryAfter: 17 })
      .mockResolvedValue({ ok: true, statusCode: 200 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(1)),
      },
      { sleep, now: clock.now },
    );

    expect(result).toMatchObject({
      succeeded: 1,
      failed: 0,
      rateLimitWaits: 1,
    });
    // 17s from Retry-After, plus the boundary slack.
    expect(sleep).toHaveBeenCalledWith(17 * 1000 + 250);
  });

  test('falls back to the window length when Retry-After is absent', async () => {
    const clock = makeClock();
    const sleep = jest.fn(clock.sleep);
    const setOne = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, statusCode: 429, retryAfter: null })
      .mockResolvedValue({ ok: true, statusCode: 200 });

    await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(1)),
      },
      { sleep, now: clock.now },
    );

    expect(sleep).toHaveBeenCalledWith(BULK_WAGE_WINDOW_MS + 250);
  });

  test('gives up on a sector after maxRetries consecutive 429s', async () => {
    const clock = makeClock();
    const setOne = jest
      .fn()
      .mockResolvedValue({ ok: false, statusCode: 429, retryAfter: 1 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(1)),
      },
      { sleep: clock.sleep, now: clock.now, maxRetries: 2 },
    );

    expect(setOne).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toMatch(/rate limited/);
  });

  // --- bulkSetWageLevel: error reporting ---

  test('reports the real status code (regression: read res.status, always undefined)', async () => {
    const clock = makeClock();
    const setOne = jest.fn().mockResolvedValue({ ok: false, statusCode: 403 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(1)),
      },
      { sleep: clock.sleep, now: clock.now },
    );

    expect(result.errors[0]).toEqual({
      sectorId: 'sector0',
      error: 'HTTP 403',
    });
    expect(result.errors[0].error).not.toMatch(/unknown/);
  });

  test('a thrown setOne is recorded and does not abort the run', async () => {
    const clock = makeClock();
    const setOne = jest
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValue({ ok: true, statusCode: 200 });

    const result = await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne,
        listSectors: () => Promise.resolve(sectors(3)),
      },
      { sleep: clock.sleep, now: clock.now },
    );

    expect(result).toMatchObject({ total: 3, succeeded: 2, failed: 1 });
    expect(result.errors[0].error).toBe('socket hang up');
  });

  test('onProgress fires once per sector with a monotonic count', async () => {
    const clock = makeClock();
    const seen = [];
    await bulkSetWageLevel(
      {
        gameUrl: 'http://g',
        corporationId: '1',
        wageLevel: 1.0,
        setOne: () => Promise.resolve({ ok: true, statusCode: 200 }),
        listSectors: () => Promise.resolve(sectors(4)),
        onProgress: (p) => seen.push(p),
      },
      { sleep: clock.sleep, now: clock.now },
    );

    expect(seen).toEqual([
      { done: 1, total: 4 },
      { done: 2, total: 4 },
      { done: 3, total: 4 },
      { done: 4, total: 4 },
    ]);
  });

  // --- estimates ---

  test('no estimated wait at or under the window budget', () => {
    expect(estimateBulkWageDurationMs(1)).toBe(0);
    expect(estimateBulkWageDurationMs(20)).toBe(0);
  });

  test('estimate grows one window per extra batch', () => {
    expect(estimateBulkWageDurationMs(21)).toBe(60000);
    expect(estimateBulkWageDurationMs(40)).toBe(60000);
    expect(estimateBulkWageDurationMs(105)).toBe(5 * 60000);
  });

  test('formatDuration reads naturally', () => {
    expect(formatDuration(0)).toBe('under a minute');
    expect(formatDuration(60000)).toBe('about 1 minute');
    expect(formatDuration(300000)).toBe('about 5 minutes');
  });
});
