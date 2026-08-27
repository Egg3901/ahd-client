'use strict';
const http = require('http');

const PORT = Number(process.env.MOCK_PORT || 3000);

// Mock manifest that enables Wages menu (isCeo + myCorporationId)
const mockClientNav = {
  hasCharacter: true,
  isCeo: true,
  myCorporationId: '123',
  user: { username: 'mock-ceo', isAdmin: false },
  characterCountryId: 'US',
  currentParty: { id: 'p1', name: 'Mock Party' },
  homeState: { id: 'US-CA', name: 'California' },
  activePresidentElectionId: null,
  unreadCount: 0,
};

const mockCharacterMe = {
  character: { _id: 'char1', name: 'Mock CEO' },
  corporation: {
    _id: 'corp123',
    pathId: '123',
    ceoId: 'char1',
    isCeo: true,
    sequentialId: 123,
  },
};

// Sector count is configurable so the paced path can be exercised: the
// largest corporation in production holds 105 sectors, well over the
// 20-per-minute write budget. `MOCK_SECTORS=105 npm run mock`.
const SECTOR_COUNT = Number(process.env.MOCK_SECTORS || 4);
const SECTOR_TYPES = ['technology', 'retail', 'energy', 'manufacturing'];
const mockSectors = Array.from({ length: SECTOR_COUNT }, (_, i) => ({
  _id: `sector${i + 1}`,
  sectorType: SECTOR_TYPES[i % SECTOR_TYPES.length],
}));

/** Fixed-window limiter mirroring AHDGame `src/lib/api/rateLimit.ts`. */
const MAX_PER_WINDOW = Number(process.env.MOCK_RATE_LIMIT || 20);
// Shortenable so the paced path can be exercised without a five-minute wait.
const WINDOW_MS = Number(process.env.MOCK_WINDOW_MS || 60000);
let windowResetAt = 0;
let windowCount = 0;

function checkRateLimit() {
  const now = Date.now();
  if (now >= windowResetAt) {
    windowResetAt = now + WINDOW_MS;
    windowCount = 0;
  }
  windowCount++;
  if (windowCount > MAX_PER_WINDOW) {
    return {
      ok: false,
      retryAfter: Math.ceil((windowResetAt - now) / 1000),
      used: windowCount,
    };
  }
  return { ok: true, used: windowCount };
}

function json(res, obj, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`[mock] ${req.method} ${url.pathname}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Cookie, X-AHD-Client-Version',
    });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/client-nav')
    return json(res, mockClientNav);
  if (req.method === 'GET' && url.pathname === '/api/character/me')
    return json(res, mockCharacterMe);
  if (req.method === 'GET' && url.pathname === '/api/countries')
    return json(res, { countries: [] });
  if (req.method === 'GET' && url.pathname === '/api/corporations/123') {
    return json(res, {
      corporation: { _id: 'corp123', name: 'Mock Corp' },
      sectors: mockSectors,
    });
  }
  if (
    req.method === 'POST' &&
    /^\/api\/corporations\/123\/sectors\/[^/]+\/wage$/.test(url.pathname)
  ) {
    // Mirror the server's limiter so client pacing can actually be exercised:
    // checkRateLimit(userId, 20, 60_000) in setSectorWageLevel.ts.
    const limit = checkRateLimit();
    if (!limit.ok) {
      console.log(`[mock] 429 — retry after ${limit.retryAfter}s`);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'Retry-After': String(limit.retryAfter),
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(
        JSON.stringify({
          error: 'Too many requests',
          code: 'rate_limited',
          retryAfterSeconds: limit.retryAfter,
        }),
      );
    }

    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (err) {
        return json(res, { error: `bad JSON: ${err.message}` }, 400);
      }
      console.log(
        `[mock] wage set ${url.pathname} -> ${parsed.wageLevel} ` +
          `(${limit.used}/${MAX_PER_WINDOW} this window)`,
      );
      const v = Number(parsed.wageLevel);
      if (!Number.isFinite(v) || v < 0.8 || v > 1.5) {
        return json(res, { error: 'out of range' }, 400);
      }
      return json(res, { success: true, wageLevel: v });
    });
    return;
  }
  // Any non-API GET renders the stub page. The title deliberately contains
  // "A House Divided" because the e2e suite asserts on it — pointing those
  // tests here instead of production is the whole reason this serves HTML.
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      `<!doctype html><html data-theme="default"><head><meta charset="utf-8">` +
        `<title>A House Divided — Mock Server</title>` +
        `<style>body{font-family:system-ui;background:#0f0f1a;color:#e0e0e0;padding:40px}` +
        `code{background:#1a1a2e;padding:2px 6px;border-radius:4px}</style></head><body>` +
        `<h1>A House Divided — Mock Server</h1>` +
        `<p>Local stub for <code>ahd-client</code> on <code>http://localhost:${PORT}</code>. ` +
        `Serving <code>${url.pathname}</code>.</p>` +
        `<p><b>Navigate &gt; World &gt; My Corporation &gt; Wages — Set all sectors</b> is enabled ` +
        `(mock CEO, corp 123, ${SECTOR_COUNT} sector(s), limit ${MAX_PER_WINDOW}/window).</p>` +
        `<p>Pick a preset, confirm, and watch the console for <code>[mock] wage set</code>.</p>` +
        `</body></html>`,
    );
  }
  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`[mock] listening on http://localhost:${PORT}`);
  console.log(
    `[mock] Run: $env:AHD_GAME_URL="http://localhost:${PORT}"; npm.cmd run dev`,
  );
});
