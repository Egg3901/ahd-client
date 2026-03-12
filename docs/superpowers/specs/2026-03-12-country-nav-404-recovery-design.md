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
2. **`fetchClientNav()`** — Replaces `fetchAuthMe()`. Hits the new `/api/client-nav` endpoint to get the full player manifest in one call. Drives menu rebuild, unread count, and auth state.
3. **404 recovery overlay** — `did-navigate` listener injects a recovery UI when `httpResponseCode === 404` on the main frame.

---

## Files Changed

| File | Change |
|------|--------|
| `src/nav.js` | **New** — country nav config table + helpers |
| `src/main.js` | Replace `fetchAuthMe()` + `unreadPollTimer` with `fetchClientNav()`; add `applyNavForCountry()`; add 404 overlay listener |
| `src/menu.js` | Add `setNavConfig(nav, manifest)`; rebuild Navigate submenu from nav config |
| `src/windows.js` | Add `updatePresets(nav)`; fix congress/country/campaign preset routes |

---

## Section 1: `src/nav.js`

Exports a `getNavForCountry(countryId)` function and a `DEFAULT_NAV` (US) fallback.

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

`getNavForCountry(countryId)` returns `COUNTRY_NAV[countryId] ?? COUNTRY_NAV.US`.

> **Note:** CA/DE executive labels (`'Parliament Hill'`, `'Chancellery'`) are correct values — the site currently shows a bug ("10 Downing Street") for these countries.

---

## Section 2: `fetchClientNav()` in `main.js`

Replaces `fetchAuthMe()` and the `unreadPollTimer` interval.

### What it fetches

`GET /api/client-nav` with session cookies forwarded from `persist:ahd` partition.

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
| Full manifest to renderer | `sendToRenderer('client-nav', manifest)` (new channel) |
| Unread count | `sendToRenderer('unread-count', { count: manifest.unreadCount })` |
| Admin menu toggle | `menuManager.setAdmin(manifest.user?.isAdmin ?? false)` |
| Nav rebuild | `applyNavForCountry(manifest.characterCountryId)` |

### Polling

Called once after `sseClient` emits `'connected'`, then on a 60s interval (same cadence as current `unreadPollTimer`). The interval ref replaces `unreadPollTimer`.

### `applyNavForCountry(countryId)`

```js
function applyNavForCountry(countryId, manifest) {
  const nav = getNavForCountry(countryId);  // from src/nav.js
  if (menuManager)    menuManager.setNavConfig(nav, manifest);
  if (windowManager)  windowManager.updatePresets(nav);
}
```

Called after every `fetchClientNav()` response. Guards against null `menuManager`/`windowManager` (called before init only if auth resolves before modules are ready — not possible given current flow, but defensive is correct).

---

## Section 3: MenuManager — Navigate Menu

### New method: `setNavConfig(nav, manifest)`

Stores `this.nav` and `this.manifest`, then calls `this.build()`.

### Navigate submenu (generated from `this.nav`)

```
Navigate
  {nav.legislature.label}                → nav.legislature.route
  {nav.executive.label}                  → nav.executive.route
  Elections                              → nav.elections.route
  Map                                    → nav.map.route
  ─────────────────────────────────────
  Political Parties                      → nav.parties.route
  National Metrics                       → nav.metrics.route
  Policy                                 → nav.policy.route
  ─────────────────────────────────────
  World / Nations                        → /world
  Politicians                            → nav.politicians.route
  News                                   → nav.news.route
  ─────────────────────────────────────
  My Party  (only if manifest.currentParty)   → /parties/[currentParty.id]
  Presidential Election  (only if nav.presidentElection
                           && manifest.activePresidentElectionId)
                                         → /elections/[activePresidentElectionId]
  ─────────────────────────────────────
  Pop Out Window ▶  (existing submenu)
```

### Default state (unauthenticated / no character)

`setNavConfig` is called with `null` countryId → `getNavForCountry(null)` returns US nav. Conditional items (My Party, Presidential Election) are hidden because manifest fields will be null.

### Removed items

- "Legislature" (was `/bills` — route doesn't exist)
- Hardcoded "Congress" (was `/legislature` — wrong route)
- Hardcoded "Country" (was `/country` — incomplete URL)

---

## Section 4: WindowManager — Preset Route Updates

### New method: `updatePresets(nav)`

Updates three dynamic presets in `WINDOW_PRESETS`:

| Preset | Old route | New route |
|--------|-----------|-----------|
| `congress` | `/legislature` | `nav.legislature.route` |
| `country` | `/country` | `nav.map.route` |
| `campaign` | `/campaign` | `/campaign` (unchanged — server redirects to player's campaign) |

`updatePresets` mutates `WINDOW_PRESETS` in place so existing `openWindow()` calls pick up correct routes without further changes.

---

## Section 5: 404 Recovery Overlay

### Trigger

```js
mainWindow.webContents.on('did-navigate',
  (_, _url, httpResponseCode, _statusText, isMainFrame) => {
    if (isMainFrame && httpResponseCode === 404) injectErrorOverlay();
  }
);
```

### `injectErrorOverlay()`

Injects a fixed-position overlay via `executeJavaScript`. The overlay:
- Covers the full viewport
- Matches dark theme background (`#0f0f1a`) with light text (theme-neutral)
- Shows message: "This page isn't available yet"
- **Go Back** button → `window.history.back()`
- **Go Home** button → IPC call → `mainWindow.loadURL(config.GAME_URL)`

The overlay is dismissed automatically on the next `did-navigate` event (a new navigation replaces the page).

No new HTML file is created — the overlay HTML is a template string in `main.js` (or extracted to a helper `injectErrorOverlay()` function).

### Also handles network failures

`did-fail-load` is fired for DNS/TCP errors (no internet, server down). Same overlay is shown with message "Couldn't connect — check your internet connection."

---

## Bugs Fixed

| Location | Bug | Fix |
|----------|-----|-----|
| `menu.js` Navigate | Congress → `/legislature` (wrong) | `nav.legislature.route` |
| `menu.js` Navigate | Legislature → `/bills` (404) | Removed |
| `windows.js` presets | `congress` → `/legislature` | `nav.legislature.route` |
| `windows.js` presets | `country` → `/country` (incomplete) | `nav.map.route` |
| CA/DE nav | Executive label shows "10 Downing Street" | Correct label per country |
| CA/DE nav | `?country=us` on all items | `?country=ca` / `?country=de` |

---

## Out of Scope

- State dropdown label localization (handled client-side in site's `StateDropdown` component; route `/state/[id]` is universal)
- UK `/uk/*` legacy route family (not linked from live navbar)
- First-run / character creation flow
- Connection loss status indicator
- Adding new countries beyond US/UK/CA/DE

---

## Testing

- Unit tests for `getNavForCountry()` — correct routes/labels per countryId, US fallback for null
- Unit tests for `MenuManager.setNavConfig()` — Navigate submenu items, conditional items
- Unit tests for `WindowManager.updatePresets()` — preset route mutation
- Integration test: `fetchClientNav()` response → correct nav applied to menu and presets
- Manual: focused mode 404 → overlay appears with working Back/Home buttons
