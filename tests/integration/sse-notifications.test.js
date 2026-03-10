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
    sse.buffer = 'event: election_resolved\ndata: {"winner":"Smith","office":"President"}\n\n';
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
