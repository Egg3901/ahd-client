# Theme System Rework — Site Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Electron app's hardcoded theme list with the site's actual themes and enable bidirectional theme sync via API and DOM observation.

**Architecture:** The main process owns theme state and makes API calls to the site. The renderer detects live theme changes via a MutationObserver on `<html data-theme>` and reports them back via IPC. Theme changes from the Electron menu are pushed to the site via `PATCH /api/settings/theme` and injected into the renderer DOM.

**Tech Stack:** Electron (main process `net.request` for API calls, `session` for cookies), IPC channels, renderer-injected MutationObserver.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/menu.js` | Modify | Update THEMES array to match site themes; no other changes |
| `src/main.js` | Modify | Update `syncNativeTheme` mapping; add theme-from-site reader after page load; inject MutationObserver; wire new IPC |
| `src/ipc.js` | Modify | Update `set-theme` handler to call site API; add `theme-changed-on-site` handler |
| `src/preload.js` | Modify | Add `theme-changed-on-site` to INVOKE_CHANNELS |
| `src/config.js` | No change | Already exports GAME_URL |

---

## Chunk 1: Theme List & Native Theme Mapping

### Task 1: Update THEMES array in menu.js

**Files:**
- Modify: `src/menu.js:11-19`

- [ ] **Step 1: Replace THEMES array**

Replace the current 7-theme array with the site's actual themes:

```javascript
const THEMES = [
  { id: 'default', label: 'Default' },
  { id: 'light', label: 'Light' },
  { id: 'oled', label: 'OLED' },
  { id: 'usa', label: 'USA' },
  { id: 'pastel', label: 'Pastel' },
  { id: 'dark-pastel', label: 'Dark Pastel' },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/menu.js
git commit -m "feat(theme): update theme list to match site themes"
```

### Task 2: Update syncNativeTheme in main.js

**Files:**
- Modify: `src/main.js:274-277`

- [ ] **Step 1: Update the dark/light mapping**

Replace the current `syncNativeTheme` function:

```javascript
function syncNativeTheme(themeId) {
  const lightThemes = ['light', 'pastel', 'usa'];
  nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
}
```

The light themes are `light`, `pastel`, and `usa`. Everything else (`default`, `oled`, `dark-pastel`) is dark.

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat(theme): update native theme mapping for site themes"
```

---

## Chunk 2: Site → App Sync (Read Theme on Load)

### Task 3: Read site theme after page navigation

**Files:**
- Modify: `src/main.js` — inside `initModules()`, after the `did-navigate` SSE cookie block

- [ ] **Step 1: Add theme reader on did-finish-load**

After `mainWindow.loadURL(config.GAME_URL)` finishes, read the `data-theme` attribute from the DOM and sync it. Add this in `initModules()`:

```javascript
// Read site theme after page finishes loading
mainWindow.webContents.on('did-finish-load', () => {
  mainWindow.webContents
    .executeJavaScript(
      `document.documentElement.getAttribute('data-theme')`,
    )
    .then((siteTheme) => {
      if (siteTheme && siteTheme !== cacheManager.getTheme()) {
        cacheManager.setTheme(siteTheme);
        syncNativeTheme(siteTheme);
      }
    })
    .catch(() => {});
});
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat(theme): read site theme on page load"
```

### Task 4: Inject MutationObserver for live theme changes

**Files:**
- Modify: `src/main.js` — inside `initModules()`
- Modify: `src/preload.js` — add channel to INVOKE_CHANNELS

- [ ] **Step 1: Add `theme-changed-on-site` to preload INVOKE_CHANNELS**

In `src/preload.js`, add `'theme-changed-on-site'` to the `INVOKE_CHANNELS` array.

- [ ] **Step 2: Inject MutationObserver after page load**

In `src/main.js`, inside `initModules()`, add after the did-finish-load block from Task 3:

```javascript
// Watch for theme changes made on the site
mainWindow.webContents.on('did-finish-load', () => {
  mainWindow.webContents.executeJavaScript(`
    (() => {
      if (window.__ahdThemeObserver) return;
      window.__ahdThemeObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === 'data-theme') {
            const theme = document.documentElement.getAttribute('data-theme');
            if (theme && window.ahdClient) {
              window.ahdClient.invoke('theme-changed-on-site', theme);
            }
          }
        }
      });
      window.__ahdThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    })();
  `);
});
```

Note: Combine both `did-finish-load` handlers into a single handler to avoid duplicate listeners.

- [ ] **Step 3: Add IPC handler for theme-changed-on-site**

In `src/ipc.js`, add:

```javascript
ipcMain.handle('theme-changed-on-site', (_event, themeId) => {
  if (cacheManager) {
    cacheManager.setTheme(themeId);
    syncNativeTheme(themeId);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/preload.js src/ipc.js
git commit -m "feat(theme): detect site theme changes via MutationObserver"
```

---

## Chunk 3: App → Site Sync (Push Theme to Server)

### Task 5: Call PATCH /api/settings/theme when user changes theme in Electron menu

**Files:**
- Modify: `src/main.js` — update the `onThemeChange` callback in `initModules()`

- [ ] **Step 1: Create a helper to PATCH theme to the site**

Add this function in `src/main.js` above `initModules()`:

```javascript
/**
 * Push a theme change to the site via PATCH /api/settings/theme.
 * Uses cookies from the persist:ahd session for auth.
 * @param {string} themeId
 */
function pushThemeToSite(themeId) {
  session
    .fromPartition('persist:ahd')
    .cookies.get({ url: config.GAME_URL })
    .then((cookies) => {
      const cookieStr = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const body = JSON.stringify({ theme: themeId });
      const request = net.request({
        url: `${config.GAME_URL}/api/settings/theme`,
        method: 'PATCH',
      });
      request.setHeader('Cookie', cookieStr);
      request.setHeader('Content-Type', 'application/json');
      request.on('response', () => {});
      request.on('error', (err) => {
        console.error('Failed to push theme to site:', err.message);
      });
      request.write(body);
      request.end();
    })
    .catch((err) => {
      console.error('Failed to get cookies for theme push:', err.message);
    });
}
```

Add `net` to the require destructuring at the top of main.js:
```javascript
const { app, BrowserWindow, shell, session, nativeTheme, net } = require('electron');
```

- [ ] **Step 2: Update onThemeChange callback to push to site and inject into renderer**

In `initModules()`, update the MenuManager instantiation:

```javascript
menuManager = new MenuManager(mainWindow, windowManager, {
  onThemeChange: (themeId) => {
    cacheManager.setTheme(themeId);
    syncNativeTheme(themeId);
    pushThemeToSite(themeId);
  },
  onTogglePip: () => pipManager.toggle(),
  onOpenFeedback: () => feedbackManager.openFeedbackDialog(),
});
```

The menu.js `viewMenu()` already handles injecting the `ahd-theme-change` CustomEvent into the renderer, so the renderer DOM will update and the MutationObserver will fire — but since the theme was initiated from the Electron menu, the IPC handler should recognize this is not a new change. To avoid a loop, update the `theme-changed-on-site` handler to skip if the theme matches what's already cached:

```javascript
ipcMain.handle('theme-changed-on-site', (_event, themeId) => {
  if (cacheManager && themeId !== cacheManager.getTheme()) {
    cacheManager.setTheme(themeId);
    syncNativeTheme(themeId);
  }
});
```

- [ ] **Step 3: Update set-theme IPC handler to also push to site**

In `src/ipc.js`, update the `set-theme` handler:

```javascript
ipcMain.handle('set-theme', (_event, themeId) => {
  if (cacheManager) {
    cacheManager.setTheme(themeId);
    syncNativeTheme(themeId);
    pushThemeToSite(themeId);
  }
});
```

This requires `pushThemeToSite` to be passed into `registerIpcHandlers`. Add it to the deps object in `main.js`:

```javascript
registerIpcHandlers({
  cacheManager,
  notificationManager,
  menuManager,
  windowManager,
  pipManager,
  feedbackManager,
  updateManager,
  sseClient,
  mainWindow,
  syncNativeTheme,
  handleGameStateEvent,
  pushThemeToSite,
});
```

And update the destructuring in `ipc.js`:

```javascript
const {
  cacheManager,
  notificationManager,
  menuManager,
  windowManager,
  pipManager,
  feedbackManager,
  updateManager,
  sseClient,
  mainWindow,
  syncNativeTheme,
  handleGameStateEvent,
  pushThemeToSite,
} = deps;
```

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/ipc.js
git commit -m "feat(theme): push theme changes to site via API"
```

---

## Chunk 4: Update CustomEvent dispatch to use site's theme attribute

### Task 6: Update renderer theme injection in menu.js

**Files:**
- Modify: `src/menu.js:194-196`

- [ ] **Step 1: Update the executeJavaScript call to set data-theme**

The current code dispatches a CustomEvent. Update it to also set the `data-theme` attribute on `<html>`, which is what the site reads:

```javascript
viewMenu() {
  return {
    label: 'View',
    submenu: [
      {
        label: 'Theme',
        submenu: THEMES.map((theme) => ({
          label: theme.label,
          click: () => {
            if (this.onThemeChange) {
              this.onThemeChange(theme.id);
            }
            // Set data-theme attribute and dispatch event for the site's ThemeContext
            this.mainWindow.webContents.executeJavaScript(
              `document.documentElement.setAttribute('data-theme', '${theme.id}');
               document.dispatchEvent(new CustomEvent('ahd-theme-change', { detail: '${theme.id}' }))`,
            );
          },
        })),
      },
      // ... rest unchanged
```

- [ ] **Step 2: Commit**

```bash
git add src/menu.js
git commit -m "feat(theme): set data-theme attribute on renderer when changing theme"
```

---

## Summary of Changes

| File | What changes |
|------|-------------|
| `src/menu.js` | THEMES array updated (6 site themes); `executeJavaScript` also sets `data-theme` attribute |
| `src/main.js` | `syncNativeTheme` updated; `pushThemeToSite` added; `did-finish-load` reads site theme + injects MutationObserver; `net` added to requires; deps updated |
| `src/ipc.js` | `set-theme` handler calls `pushThemeToSite`; `theme-changed-on-site` handler added; `pushThemeToSite` added to deps |
| `src/preload.js` | `theme-changed-on-site` added to INVOKE_CHANNELS |
