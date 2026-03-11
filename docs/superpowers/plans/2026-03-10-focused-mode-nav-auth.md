# Focused Mode, Navigation & Auth Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement focused mode (navbar removal), bidirectional route tracking, back/forward nav, auth state sync, notification badge, zoom controls, loading indicator, window title mapping, and context menu.

**Architecture:** All features live in `main.js` (following the existing pattern), with new IPC channels wired through `ipc.js` and exposed via `preload.js`. Auth state is fetched from the main process using `net.request` with session cookies, matching the existing `pushThemeToSite` pattern. Navigation events drive route tracking and window title updates.

**Tech Stack:** Electron `net.request`, `session`, `webContents` events (`did-navigate`, `did-navigate-in-page`, `did-start-loading`, `did-stop-loading`, `context-menu`), `ipcMain`, `contextBridge`.

---

## File Structure

| File | Action | What changes |
|------|--------|-------------|
| `src/main.js` | Modify | Focused mode cookie; route tracking; nav-state; loading state; window title mapping; context menu; auth fetch helper; unread count polling |
| `src/ipc.js` | Modify | Add handlers: `go-back`, `go-forward`, `set-zoom`, `get-zoom` |
| `src/preload.js` | Modify | Add new RECEIVE channels and INVOKE channels; add convenience methods |

No new files — all additions follow existing module patterns in `main.js`.

---

## Chunk 1: Focused Mode Cookie

### Task 1: Set `ahd-display-mode=focused` before GAME_URL loads

**Files:**
- Modify: `src/main.js` — `createWindow()`, the `did-finish-load` handler on line ~74

- [ ] **Step 1: Make the `did-finish-load` handler async and set cookie before `loadURL`**

In `createWindow()`, replace:

```javascript
mainWindow.webContents.once('did-finish-load', () => {
  mainWindow.loadURL(config.GAME_URL);
});
```

With:

```javascript
mainWindow.webContents.once('did-finish-load', async () => {
  await session.fromPartition('persist:ahd').cookies.set({
    url: config.GAME_URL,
    name: 'ahd-display-mode',
    value: 'focused',
    path: '/',
    sameSite: 'lax',
  });
  mainWindow.loadURL(config.GAME_URL);
});
```

This sets the cookie before the game server loads, so Next.js reads it server-side and suppresses the top navbar (64px). The cookie lives in the `persist:ahd` session — same partition as all other auth cookies.

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat(nav): set ahd-display-mode=focused cookie before game load"
```

---

## Chunk 2: IPC Channel Declarations

### Task 2: Add new channels to preload.js

**Files:**
- Modify: `src/preload.js`

New channels needed:

**RECEIVE_CHANNELS** (main → renderer, push):
- `route-changed` — `{ path: string }` on every navigation
- `nav-state` — `{ canGoBack: boolean, canGoForward: boolean }` on every navigation
- `loading-state` — `{ loading: boolean }` on page load start/stop
- `auth-state` — `{ user: object | null }` on load and poll
- `unread-count` — `{ count: number }` on poll

**INVOKE_CHANNELS** (renderer → main, request/response):
- `go-back` — navigate back
- `go-forward` — navigate forward
- `set-zoom` — `factor: number` — set zoom level
- `get-zoom` — returns current zoom factor

- [ ] **Step 1: Add RECEIVE_CHANNELS**

```javascript
const RECEIVE_CHANNELS = [
  'sse-status',
  'flush-queue',
  'open-feedback',
  'update-status',
  'route-changed',
  'nav-state',
  'loading-state',
  'auth-state',
  'unread-count',
];
```

- [ ] **Step 2: Add INVOKE_CHANNELS**

```javascript
const INVOKE_CHANNELS = [
  'get-game-state',
  'get-cached-turn',
  'queue-action',
  'get-queue',
  'get-theme',
  'set-theme',
  'get-preferences',
  'set-preference',
  'update-game-state',
  'open-window',
  'toggle-pip',
  'capture-screenshot',
  'get-system-info',
  'check-updates',
  'get-sse-status',
  'set-admin',
  'theme-changed-on-site',
  'go-back',
  'go-forward',
  'set-zoom',
  'get-zoom',
];
```

- [ ] **Step 3: Add convenience methods to the exposed API**

At the end of `contextBridge.exposeInMainWorld('ahdClient', {...})`, add:

```javascript
  // Navigation
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),

  // Zoom
  setZoom: (factor) => ipcRenderer.invoke('set-zoom', factor),
  getZoom: () => ipcRenderer.invoke('get-zoom'),
```

- [ ] **Step 4: Commit**

```bash
git add src/preload.js
git commit -m "feat(nav): add navigation and zoom IPC channels to preload"
```

---

## Chunk 3: IPC Handlers

### Task 3: Add go-back, go-forward, set-zoom, get-zoom handlers in ipc.js

**Files:**
- Modify: `src/ipc.js`

The `mainWindow` ref is already in deps, so these are trivial wrappers.

- [ ] **Step 1: Add handlers after the existing `set-admin` handler**

```javascript
  ipcMain.handle('go-back', () => {
    if (mainWindow && mainWindow.webContents.canGoBack()) {
      mainWindow.webContents.goBack();
    }
  });

  ipcMain.handle('go-forward', () => {
    if (mainWindow && mainWindow.webContents.canGoForward()) {
      mainWindow.webContents.goForward();
    }
  });

  ipcMain.handle('set-zoom', (_event, factor) => {
    if (mainWindow) mainWindow.webContents.setZoomFactor(factor);
  });

  ipcMain.handle('get-zoom', () => {
    return mainWindow ? mainWindow.webContents.getZoomFactor() : 1;
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/ipc.js
git commit -m "feat(nav): add go-back, go-forward, zoom IPC handlers"
```

---

## Chunk 4: Route Tracking, Nav State, Loading, Window Title

All four features share the same `webContents` navigation events so they're implemented together in `initModules()`.

### Task 4: Route tracking, nav-state, loading indicator, window title

**Files:**
- Modify: `src/main.js` — inside `initModules()`

- [ ] **Step 1: Add a `sendNavState` helper near `sendToRenderer`**

```javascript
/**
 * Send current back/forward availability to the renderer.
 */
function sendNavState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendToRenderer('nav-state', {
      canGoBack: mainWindow.webContents.canGoBack(),
      canGoForward: mainWindow.webContents.canGoForward(),
    });
  }
}
```

- [ ] **Step 2: Add a `getTitleForPath` helper**

```javascript
/**
 * Map a URL pathname to a human-readable window title segment.
 * Uses the first path segment for matching so /state/ohio → "State".
 * @param {string} pathname
 * @returns {string}
 */
function getTitleForPath(pathname) {
  const section = pathname.split('/').filter(Boolean)[0] || '';
  const titles = {
    '': 'Home',
    politician: 'My Politician',
    campaign: 'Campaign HQ',
    notifications: 'Notifications',
    achievements: 'Achievements',
    elections: 'Elections',
    legislature: 'Congress',
    bills: 'Legislature',
    state: 'State',
    country: 'Country',
    world: 'World',
    wiki: 'Game Wiki',
    roadmap: 'Roadmap',
    changelog: 'Changelog',
    admin: 'Admin',
    login: 'Login',
    register: 'Register',
    settings: 'Settings',
    feedback: 'Feedback',
    actions: 'Actions',
    profile: 'Profile',
  };
  return titles[section] || section || 'A House Divided';
}
```

- [ ] **Step 3: Wire navigation events in `initModules()` after the `did-finish-load` block**

```javascript
  // Route tracking, nav-state, and window title on navigation
  function onNavigate(_event, url) {
    try {
      const { pathname, search } = new URL(url);
      const path = pathname + search;
      sendToRenderer('route-changed', { path });
      sendNavState();
      mainWindow.setTitle(`A House Divided \u2014 ${getTitleForPath(pathname)}`);

      // Optimistically clear unread badge when user visits notifications
      if (pathname === '/notifications' && notificationManager) {
        notificationManager.clearUnread();
        sendToRenderer('unread-count', { count: 0 });
        if (trayManager) trayManager.updateMenu();
      }
    } catch {
      // url may be file:// during loading screen — ignore
    }
  }

  mainWindow.webContents.on('did-navigate', onNavigate);
  mainWindow.webContents.on('did-navigate-in-page', onNavigate);
```

Note: Remove or guard the existing `page-title-updated` handler in `createWindow()` if route-based title updates conflict. The existing handler updates on `page-title-updated`; keep it but the route-based title will override when navigating.

- [ ] **Step 4: Wire loading state**

```javascript
  // Loading indicator
  mainWindow.webContents.on('did-start-loading', () => {
    sendToRenderer('loading-state', { loading: true });
  });
  mainWindow.webContents.on('did-stop-loading', () => {
    sendToRenderer('loading-state', { loading: false });
  });
```

- [ ] **Step 5: Commit**

```bash
git add src/main.js
git commit -m "feat(nav): route tracking, nav-state, loading indicator, window title"
```

---

## Chunk 5: Context Menu

### Task 5: Right-click context menu

**Files:**
- Modify: `src/main.js` — inside `initModules()`
- `Menu` must be added to the electron require destructuring at the top

- [ ] **Step 1: Add `Menu` to the electron require**

```javascript
const { app, BrowserWindow, shell, session, nativeTheme, net, Menu } = require('electron');
```

- [ ] **Step 2: Wire `context-menu` event in `initModules()`**

```javascript
  // Context menu (browser chrome is hidden in focused mode)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const items = [];

    if (params.isEditable) {
      items.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
      );
    } else if (params.selectionText) {
      items.push({ role: 'copy' }, { type: 'separator' });
    }

    items.push({
      label: 'Reload',
      click: () => mainWindow.loadURL(config.GAME_URL),
    });

    Menu.buildFromTemplate(items).popup({ window: mainWindow });
  });
```

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(nav): add right-click context menu for focused mode"
```

---

## Chunk 6: Auth State Sync & Notification Badge

### Task 6: Auth fetch helper + initial load

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Add `fetchAuthMe` helper**

Add near `pushThemeToSite` in the `// --- Theme sync ---` section (or a new `// --- Auth ---` comment block):

```javascript
// --- Auth ---

/**
 * Fetch the current user from GET /api/auth/me using session cookies.
 * Returns the user object or null if unauthenticated/error.
 * @returns {Promise<object|null>}
 */
function fetchAuthMe() {
  return new Promise((resolve) => {
    session
      .fromPartition('persist:ahd')
      .cookies.get({ url: config.GAME_URL })
      .then((cookies) => {
        const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        const req = net.request({
          url: `${config.GAME_URL}/api/auth/me`,
          method: 'GET',
        });
        req.setHeader('Cookie', cookieStr);
        req.setHeader('Accept', 'application/json');

        let body = '';
        req.on('response', (res) => {
          res.on('data', (chunk) => {
            body += chunk.toString();
          });
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              resolve(data.user || null);
            } catch {
              resolve(null);
            }
          });
          res.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.end();
      })
      .catch(() => resolve(null));
  });
}
```

- [ ] **Step 2: Fetch auth on `did-finish-load` and send to renderer**

In the existing `did-finish-load` handler in `initModules()`, add after the MutationObserver injection:

```javascript
    // Fetch auth state and send to renderer
    fetchAuthMe().then((user) => {
      sendToRenderer('auth-state', { user });
    });
```

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(auth): fetch auth state on page load and push to renderer"
```

### Task 7: Unread count polling

**Files:**
- Modify: `src/main.js` — inside `initModules()`

- [ ] **Step 1: Start unread count poll after SSE connects**

In `initModules()`, after `registerIpcHandlers(...)`, add:

```javascript
  // Poll /api/auth/me every 60s for unread notification count
  const UNREAD_POLL_INTERVAL = 60 * 1000;
  let unreadPollTimer = null;

  function pollUnreadCount() {
    fetchAuthMe().then((user) => {
      if (user) {
        const count = user.unreadCount || 0;
        sendToRenderer('unread-count', { count });
      }
    });
  }

  // Start polling once SSE connects (means user is authenticated)
  sseClient.once('connected', () => {
    pollUnreadCount();
    unreadPollTimer = setInterval(pollUnreadCount, UNREAD_POLL_INTERVAL);
  });
```

- [ ] **Step 2: Clear the poll timer in `cleanup()`**

In the `cleanup()` function, add:

```javascript
  if (unreadPollTimer) {
    clearInterval(unreadPollTimer);
    unreadPollTimer = null;
  }
```

`unreadPollTimer` needs to be promoted to module scope. Move the `let unreadPollTimer = null;` declaration to the top of the file near the other module singletons.

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat(auth): poll unread notification count every 60s"
```

---

## Summary of All Changes

| File | Lines changed | What was added |
|------|--------------|----------------|
| `src/main.js` | ~100 lines added | Focused mode cookie; `pushThemeToSite` (existing); `fetchAuthMe`; `sendNavState`; `getTitleForPath`; `onNavigate` handler; loading state; context menu; unread poll; `cleanup()` update |
| `src/ipc.js` | ~20 lines added | `go-back`, `go-forward`, `set-zoom`, `get-zoom` handlers |
| `src/preload.js` | ~15 lines added | 5 RECEIVE channels, 4 INVOKE channels, 4 convenience methods |
