# Country-Aware Navigation & 404 Recovery — Design Spec

**Date:** 2026-03-12
**Status:** Approved

---

## Problem

The desktop client hardcodes US-centric routes and labels in `menu.js` and `windows.js`. This causes:

1. **Broken routes** — Congress links to `/legislature` (wrong); Legislature links to `/bills` (doesn't exist); campaign/country popups use incomplete URLs.
2. **Wrong nav for non-US players** — UK players see "Congress" instead of "Parliament"; CA/DE players get US-scoped query params due to a binary `isUKContext` bug carried over from the site.
3. **404 trap in focused mode** — When a page 404s, the user is stranded with no visible back button because the menu bar is hidden.

---

## Solution Overview

Three coordinated changes:

1. **`src/nav.js`** — New module. Static per-country route/label config. Single source of truth for all navigation in the client.
2. **`fetchClientNav()`** — Replaces `fetchAuthMe()`. Hits `/api/client-nav` to get the full player manifest in one call. Drives menu rebuild, unread count, and auth state.
3. **404 recovery overlay** — `did-navigate` listener injects a recovery UI when `httpResponseCode === 404` on the main frame. `did-fail-load` injects the same overlay for network failures.

---

## Files Changed

| File | Change |
|------|--------|
| `src/nav.js` | **New** — country nav config table + `getNavForCountry()` |
| `src/main.js` | Replace `fetchAuthMe()` + `unreadPollTimer` with `fetchClientNav()`; add `applyNavForCountry(countryId, manifest)`; add 404/fail overlay listeners; update `getTitleForPath` for `/legislature/*` |
| `src/menu.js` | Add `setNavConfig(nav, manifest)`; rebuild Navigate submenu from nav config |
| `src/windows.js` | Add `updatePresets(nav)`; update preset route **and title** for `congress` and `country` |
| `src/preload.js` | Add `'client-nav'` to `RECEIVE_CHANNELS` whitelist |
| `src/ipc.js` | Add `'go-home'` IPC handler → `mainWindow.loadURL(config.GAME_URL)` |

---

## Section 1: `src/nav.js`

Exports `getNavForCountry(countryId)`. Returns `COUNTRY_NAV[countryId] ?? COUNTRY_NAV.US` — unknown or null countryId falls back to US nav.

### Country config table

```js
const COUNTRY_NAV = {
  US: {
    executive:   { route: '/executive/us',   label: 'White House' },
    legislature: { route: '/legislature/us', label: 'Congress' },
    map:         { route: '/map',            label: 'Map' },
    elections:   { route: '/elections?country=us' },
    parties:     { route: '/parties?country=us' },
    metrics:     { route: '/metrics?country=us' },
    policy:      { route: '/policy?country=us' },
    politicians: { route: '/politicians?country=us' },
    news:        { route: '/news?country=us' },
    presidentElection: true,
  },
  UK: {
    executive:   { route: '/executive/uk',   label: '10 Downing Street' },
    legislature: { route: '/legislature/uk', label: 'Parliament' },
    map:         { route: '/uk/map',         label: 'Map' },
    elections:   { route: '/elections?country=uk' },
    parties:     { route: '/parties?country=uk' },
    metrics:     { route: '/metrics?country=uk' },
    policy:      { route: '/policy?country=uk' },
    politicians: { route: '/politicians?country=uk' },
    news:        { route: '/news?country=uk' },
    presidentElection: false,
  },
  CA: {
    executive:   { route: '/executive/ca',   label: 'Parliament Hill' },
    legislature: { route: '/legislature/ca', label: 'Parliament' },
    map:         { route: '/country/ca/map', label: 'Map' },
    elections:   { route: '/elections?country=ca' },
    parties:     { route: '/parties?country=ca' },
    metrics:     { route: '/metrics?country=ca' },
    policy:      { route: '/policy?country=ca' },
    politicians: { route: '/politicians?country=ca' },
    news:        { route: '/news?country=ca' },
    presidentElection: false,
  },
  DE: {
    executive:   { route: '/executive/de',   label: 'Chancellery' },
    legislature: { route: '/legislature/de', label: 'Bundestag' },
    map:         { route: '/country/de/map', label: 'Map' },
    elections:   { route: '/elections?country=de' },
    parties:     { route: '/parties?country=de' },
    metrics:     { route: '/metrics?country=de' },
    policy:      { route: '/policy?country=de' },
    politicians: { route: '/politicians?country=de' },
    news:        { route: '/news?country=de' },
    presidentElection: false,
  },
};
```

> **Note:** CA/DE executive labels (`'Parliament Hill'`, `'Chancellery'`) are correct values — the site currently shows "10 Downing Street" for these countries (site bug).

> **Future:** When a new country is added to the server, add its entry to `COUNTRY_NAV`. `getNavForCountry` will return US nav for any unrecognised code, which is safe but imperfect — a console warning should be emitted when the fallback fires in production.

---

## Section 2: `fetchClientNav()` in `main.js`

Replaces `fetchAuthMe()` and `unreadPollTimer`.

### What it fetches

`GET /api/client-nav` with cookies forwarded from `persist:ahd` partition (same pattern as `fetchAuthMe`).

### Manifest shape (from server)

```ts
{
  user: { username: string; isAdmin: boolean } | null,
  hasCharacter: boolean,
  characterCountryId: 'US' | 'UK' | 'CA' | 'DE' | null,
  unreadCount: number,
  homeState: { id: string; name: string } | null,
  currentParty: { id: string; name: string } | null,
  activeElection: { id: string; label: string } | null,
  activePresidentElectionId: string | null,
  missingDemographics: boolean,
}
```

### What it drives

| Action | How |
|--------|-----|
| Auth state to renderer | `sendToRenderer('auth-state', { user, hasCharacter, missingDemographics })` |
| Full manifest to renderer | `sendToRenderer('client-nav', manifest)` — new channel, whitelisted in `preload.js` |
| Unread count | `sendToRenderer('unread-count', { count: manifest.unreadCount })` |
| Admin menu toggle | `menuManager.setAdmin(manifest.user?.isAdmin ?? false)` |
| Nav rebuild | `applyNavForCountry(manifest.characterCountryId, manifest)` |

### Polling

`fetchClientNav()` is called in two places:
1. Inside `sseClient.once('connected', ...)` — primary path when SSE connects
2. Inside `did-finish-load` handler — fallback for when SSE has not yet connected (e.g. server slow, first load before SSE handshake). This mirrors the current `fetchAuthMe` call location.

A 60s `setInterval` replaces `unreadPollTimer`, stored under the same variable name. The interval is cleared in `cleanup()` as before.

### `applyNavForCountry(countryId, manifest)`

```js
function applyNavForCountry(countryId, manifest) {
  const nav = getNavForCountry(countryId);  // from src/nav.js
  if (menuManager)   menuManager.setNavConfig(nav, manifest);
  if (windowManager) windowManager.updatePresets(nav);
}
```

Both arguments are required. `manifest` is passed to `setNavConfig` so the Navigate menu can render conditional items (My Party, Presidential Election).

---

## Section 3: MenuManager — Navigate Menu

### New method: `setNavConfig(nav, manifest)`

Stores `this.nav` and `this.manifest`, then calls `this.build()`.

Initial values: `this.nav = getNavForCountry(null)` (US), `this.manifest = null`. Navigate menu renders without conditional items until the first manifest arrives.

### Navigate submenu (generated from `this.nav` and `this.manifest`)

```
Navigate
  {nav.legislature.label}                      → nav.legislature.route
  {nav.executive.label}                        → nav.executive.route
  Elections                                    → nav.elections.route
  Map                                          → nav.map.route
  ───────────────────────────────────────────
  Political Parties                            → nav.parties.route
  National Metrics                             → nav.metrics.route
  Policy                                       → nav.policy.route
  ───────────────────────────────────────────
  World / Nations                              → /world
  Politicians                                  → nav.politicians.route
  News                                         → nav.news.route
  ───────────────────────────────────────────
  My Party  (only if manifest?.currentParty)   → /parties/[currentParty.id]
  Presidential Election                        → /elections/[activePresidentElectionId]
    (only if nav.presidentElection && manifest?.activePresidentElectionId)
  ───────────────────────────────────────────
  Pop Out Window ▶  (existing submenu, unchanged)
```

### Removed items

- "Legislature" (was `/bills` — route doesn't exist on server)
- Hardcoded "Congress" (was `/legislature` — wrong route, replaced by dynamic legislature item)
- Hardcoded "Country" (was `/country` — incomplete URL, replaced by Map in pop-out submenu)

---

## Section 4: WindowManager — Preset Route Updates

### New method: `updatePresets(nav)`

Updates route **and title** for two dynamic presets in `WINDOW_PRESETS`:

| Preset key | Old route | New route | New title |
|------------|-----------|-----------|-----------|
| `congress` | `/legislature` | `nav.legislature.route` | `{nav.legislature.label} — A House Divided` |
| `country`  | `/country`     | `nav.map.route`         | `Map — A House Divided` |
| `campaign` | `/campaign`    | `/campaign` (unchanged) | unchanged |

Mutates `WINDOW_PRESETS` in place — existing `openWindow()` calls pick up correct values without further changes.

---

## Section 5: 404 Recovery Overlay

### IPC wiring

A new `'go-home'` handler is registered in `src/ipc.js`:
```js
ipcMain.handle('go-home', () => {
  mainWindow.loadURL(config.GAME_URL);
});
```

`'go-home'` is added to `INVOKE_CHANNELS` in `src/preload.js` so the renderer can call `window.ahdClient.invoke('go-home')`.

`'client-nav'` is added to `RECEIVE_CHANNELS` in `src/preload.js` so the renderer can listen via `window.ahdClient.on('client-nav', handler)`.

### Trigger — 404

Registered in `initModules()`, **after** the existing `onNavigate` listener binding (so ordering is: `onNavigate` fires first for route/title updates, then the 404 check fires):

```js
mainWindow.webContents.on('did-navigate',
  (_, _url, httpResponseCode, _statusText, isMainFrame) => {
    if (isMainFrame && httpResponseCode === 404) injectErrorOverlay('not-found');
  }
);
```

### Trigger — network failure

```js
mainWindow.webContents.on('did-fail-load',
  (_, errorCode, _errorDescription, _url, isMainFrame) => {
    // -3 = ABORTED (user navigated away), ignore
    if (isMainFrame && errorCode !== -3) injectErrorOverlay('connection');
  }
);
```

### Dismissal

- **404 overlay:** dismissed automatically when a new navigation completes — the page replacement clears the injected DOM.
- **Network failure overlay:** the page does not replace on `did-fail-load`. The overlay is dismissed by listening to `did-start-loading` and calling `executeJavaScript` to remove the overlay element by its ID (`#ahd-error-overlay`).

### `injectErrorOverlay(type)`

Injects a fixed-position overlay via `executeJavaScript`. The overlay:
- ID: `ahd-error-overlay` (used for dismissal)
- Covers the full viewport with `z-index: 999999`
- Background: `#0f0f1a` (dark, theme-neutral)
- Message: `"This page isn't available yet"` (type `'not-found'`) or `"Couldn't connect — check your internet connection"` (type `'connection'`)
- **Go Back** button → calls `window.history.back()` inline (no IPC needed)
- **Go Home** button → calls `window.ahdClient.invoke('go-home')` via the new IPC channel

No new HTML file — the overlay is a self-contained template string.

---

## `getTitleForPath` update in `main.js`

The existing `getTitleForPath` maps `'legislature'` → `'Congress'` (line ~664). This must be updated to map `'legislature'` → the current nav's legislature label. Since `getTitleForPath` is a pure function called from `onNavigate`, it should accept an optional `nav` parameter and look up `nav.legislature.label ?? 'Congress'` for the `'legislature'` key. The module-level `currentNav` variable (set by `applyNavForCountry`) is used as the default.

---

## Bugs Fixed

| Location | Bug | Fix |
|----------|-----|-----|
| `menu.js` Navigate | Congress → `/legislature` (wrong) | `nav.legislature.route` |
| `menu.js` Navigate | Legislature → `/bills` (404) | Removed |
| `windows.js` presets | `congress` → `/legislature` | `nav.legislature.route` + correct title |
| `windows.js` presets | `country` → `/country` (incomplete) | `nav.map.route` + correct title |
| CA/DE nav | Executive label shows "10 Downing Street" | Correct label per country |
| CA/DE nav | `?country=us` on all items | `?country=ca` / `?country=de` |
| `main.js` | `getTitleForPath` maps `legislature` → `'Congress'` | Dynamic label from current nav |

---

## Out of Scope

- State dropdown label localization (route `/state/[id]` is universal; label derives from `homeState.name`)
- UK `/uk/*` legacy route family (not linked from live navbar)
- First-run / character creation flow
- Connection loss status indicator
- Adding new countries beyond US/UK/CA/DE

---

## Testing

**New unit tests:**
- `nav.test.js`: `getNavForCountry()` — correct routes/labels for all 4 countries; US fallback for `null`; US fallback for unknown string (e.g. `'AU'`); console warning emitted on unknown code
- `menu.test.js`: `setNavConfig()` — Navigate submenu items match nav config; conditional items (My Party, Presidential Election) present/absent based on manifest fields; no conditional items when manifest is null
- `windows.test.js`: `updatePresets()` — `congress` preset route and title updated; `country` preset route updated; `campaign` preset unchanged

**Updates to existing tests:**
- `windows.test.js` line 17: update `toHaveLength(6)` comment to reflect that `congress` and `country` preset routes now require `updatePresets()` before use
- `windows.test.js`: update any assertions that hardcode `/legislature` or `/country` routes

**Integration tests:**
- Mock `fetchClientNav()` response with UK manifest → Navigate menu shows "Parliament", window preset for `congress` routes to `/legislature/uk`
- Mock response with null `characterCountryId` → US nav applied, no conditional items

**Manual:**
- Focused mode → navigate to a 404 page → overlay appears with working Go Back and Go Home buttons
- Network offline → navigate → connection overlay appears; comes back online → overlay dismisses on next load attempt
