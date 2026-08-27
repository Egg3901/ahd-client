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
  corporation: { _id: 'corp123', pathId: '123', ceoId: 'char1', isCeo: true, sequentialId: 123 },
};

const mockSectors = [
  { _id: 'sector1', sectorType: 'technology' },
  { _id: 'sector2', sectorType: 'retail' },
  { _id: 'sector3', sectorType: 'energy' },
  { _id: 'sector4', sectorType: 'manufacturing' },
];

function json(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  console.log(`[mock] ${req.method} ${url.pathname}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Cookie, X-AHD-Client-Version' });
    return res.end();
  }

  if (req.method === 'GET' && url.pathname === '/api/client-nav') return json(res, mockClientNav);
  if (req.method === 'GET' && url.pathname === '/api/character/me') return json(res, mockCharacterMe);
  if (req.method === 'GET' && url.pathname === '/api/countries') return json(res, { countries: [] });
  if (req.method === 'GET' && url.pathname === '/api/corporations/123') {
    return json(res, { corporation: { _id: 'corp123', name: 'Mock Corp' }, sectors: mockSectors });
  }
  if (req.method === 'POST' && /^\/api\/corporations\/123\/sectors\/[^/]+\/wage$/.test(url.pathname)) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        console.log(`[mock] wage set ${url.pathname} -> ${parsed.wageLevel}`);
        // clamp server-side too
        const v = Number(parsed.wageLevel);
        if (!Number.isFinite(v) || v < 0.8 || v > 1.5) return json(res, { error: 'out of range' }, 400);
      } catch {}
      return json(res, { success: true });
    });
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/corporation/123' || url.pathname.startsWith('/corporation'))) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<!doctype html><html data-theme="default"><head><meta charset="utf-8"><title>Mock Game — Wages Preview</title><style>body{font-family:system-ui;background:#0f0f1a;color:#e0e0e0;padding:40px}code{background:#1a1a2e;padding:2px 6px;border-radius:4px}</style></head><body><h1>Mock Game — Wages Preview</h1><p>This is a <code>http://localhost:${PORT}</code> stub for <code>ahd-client</code>.</p><p><b>Navigate &gt; World &gt; My Corporation &gt; Wages — Set all sectors</b> should be enabled (mock CEO, corp 123, 4 sectors).</p><p>Pick a preset → confirm dialog → watch console for <code>[mock] wage set</code>.</p><p>Close this and use the Electron menu.</p></body></html>`);
  }
  json(res, { error: 'not found' }, 404);
});

server.listen(PORT, () => {
  console.log(`[mock] listening on http://localhost:${PORT}`);
  console.log(`[mock] Run: $env:AHD_GAME_URL="http://localhost:${PORT}"; npm.cmd run dev`);
});
