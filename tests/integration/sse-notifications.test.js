'use strict';

/**
 * Integration test: SSEClient -> NotificationManager
 *
 * Uses real instances of both modules wired together the same way main.js does.
 * Electron APIs (BrowserWindow, Notification) are mocked via tests/__mocks__/electron.js.
 */

const { BrowserWindow } = require('electron');
const SSEClient = require('../../src/sse');
const NotificationManager = require('../../src/notifications');

describe('SSE -> NotificationManager integration', () => {
  let sse;
  let notifications;
  let mockWindow;

  beforeEach(() => {
    // Create real instances
    sse = new SSEClient();
    mockWindow = new BrowserWindow();
    // Window must not be focused so notifications fire
    mockWindow.isFocused.mockReturnValue(false);
    mockWindow.isDestroyed.mockReturnValue(false);

    notifications = new NotificationManager(mockWindow);

    // Wire SSEClient -> NotificationManager (same as main.js)
    sse.on('event', (event) => notifications.handleSSEEvent(event));
  });

  test('turn_complete SSE event increments unread count to 1', () => {
    sse.buffer = 'event: turn_complete\ndata: {"turn":5}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(1);
  });

  test('election_resolved SSE event increments unread count to 1', () => {
    sse.buffer =
      'event: election_resolved\ndata: {"winner":"Smith","office":"President"}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(1);
  });

  test('two SSE events in buffer result in unread count of 2', () => {
    sse.buffer =
      'event: turn_complete\ndata: {"turn":5}\n\n' +
      'event: election_resolved\ndata: {"winner":"Smith","office":"President"}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(2);
  });

  test('clearUnread resets unread count to 0 after events', () => {
    sse.buffer =
      'event: turn_complete\ndata: {"turn":5}\n\n' +
      'event: election_resolved\ndata: {"winner":"Smith","office":"President"}\n\n';
    sse.processBuffer();

    expect(notifications.getUnreadCount()).toBe(2);

    notifications.clearUnread();

    expect(notifications.getUnreadCount()).toBe(0);
  });
});

describe('SSE theme_changed -> CacheManager + syncNativeTheme integration', () => {
  const { nativeTheme } = require('electron');
  const CacheManager = require('../../src/cache');

  // Mirrors the syncNativeTheme logic in main.js
  function syncNativeTheme(themeId) {
    const lightThemes = ['light', 'pastel', 'usa'];
    nativeTheme.themeSource = lightThemes.includes(themeId) ? 'light' : 'dark';
  }

  let sse;
  let cache;

  beforeEach(() => {
    sse = new SSEClient();
    cache = new CacheManager();
    nativeTheme.themeSource = 'system';

    // Wire theme_changed SSE event — mirrors main.js handler
    sse.on('event', (event) => {
      if (event.type === 'theme_changed' && event.data?.theme) {
        const theme = event.data.theme;
        if (theme !== cache.getTheme()) {
          cache.setTheme(theme);
          syncNativeTheme(theme);
        }
      }
    });
  });

  test('theme_changed SSE event updates cache and sets nativeTheme to light', () => {
    sse.buffer =
      'event: theme_changed\ndata: {"theme":"light","userId":"u1"}\n\n';
    sse.processBuffer();

    expect(cache.getTheme()).toBe('light');
    expect(nativeTheme.themeSource).toBe('light');
  });

  test('theme_changed SSE event for dark theme sets nativeTheme to dark', () => {
    sse.buffer =
      'event: theme_changed\ndata: {"theme":"oled","userId":"u1"}\n\n';
    sse.processBuffer();

    expect(cache.getTheme()).toBe('oled');
    expect(nativeTheme.themeSource).toBe('dark');
  });

  test('theme_changed SSE event is a no-op when theme is already current', () => {
    cache.setTheme('dark-pastel');
    nativeTheme.themeSource = 'dark';

    sse.buffer =
      'event: theme_changed\ndata: {"theme":"dark-pastel","userId":"u1"}\n\n';
    sse.processBuffer();

    // nativeTheme was already 'dark' — handler should not reassign it
    expect(nativeTheme.themeSource).toBe('dark');
    expect(cache.getTheme()).toBe('dark-pastel');
  });

  test('non-theme SSE events do not affect theme cache', () => {
    sse.buffer = 'event: turn_complete\ndata: {"turn":5}\n\n';
    sse.processBuffer();

    expect(cache.getTheme()).toBe('default'); // unchanged
  });
});
