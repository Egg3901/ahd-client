'use strict';

// electron is automatically mapped to tests/__mocks__/electron.js by jest.config.js
const { Notification, BrowserWindow } = require('electron');
const NotificationManager = require('../../src/notifications');

/**
 * Build a minimal mock BrowserWindow with controllable focus state.
 */
function makeMockWindow({ focused = false } = {}) {
  const win = new BrowserWindow();
  // Override isFocused to return the supplied value
  win.isFocused.mockReturnValue(focused);
  win.isDestroyed.mockReturnValue(false);
  return win;
}

describe('NotificationManager', () => {
  let manager;
  let win;

  beforeEach(() => {
    jest.clearAllMocks();
    win = makeMockWindow({ focused: false });
    manager = new NotificationManager(win, null);
  });

  // --- Initial state ---

  test('starts with 0 unread notifications', () => {
    expect(manager.getUnreadCount()).toBe(0);
  });

  // --- setEnabled ---

  test('setEnabled(false) suppresses notifications — handleSSEEvent is a no-op', () => {
    manager.setEnabled(false);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 1 } });

    expect(manager.getUnreadCount()).toBe(0);
    expect(Notification.prototype.show).not.toHaveBeenCalled();
  });

  // --- Window NOT focused ---

  test('when window is not focused: handleSSEEvent increments unread count', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 2 } });
    expect(manager.getUnreadCount()).toBe(1);
  });

  test('when window is not focused: handleSSEEvent shows a notification', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 2 } });
    expect(Notification.prototype.show).toHaveBeenCalledTimes(1);
  });

  // --- Window IS focused, event is NOT turn_complete ---

  test('when window is focused and event is not turn_complete: increments unread', () => {
    win.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({
      type: 'election_resolved',
      data: { winner: 'Alice', office: 'Senate' },
    });
    expect(manager.getUnreadCount()).toBe(1);
  });

  test('when window is focused and event is not turn_complete: no notification is shown', () => {
    win.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({
      type: 'bill_enacted',
      data: { name: 'Test Bill' },
    });
    expect(Notification.prototype.show).not.toHaveBeenCalled();
  });

  // --- Window IS focused, event IS turn_complete ---

  test('when window is focused and event is turn_complete: does NOT increment unread', () => {
    win.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 3 } });
    expect(manager.getUnreadCount()).toBe(0);
  });

  test('when window is focused and event is turn_complete: no notification is shown', () => {
    win.isFocused.mockReturnValue(true);
    manager.handleSSEEvent({ type: 'turn_complete', data: { turn: 3 } });
    expect(Notification.prototype.show).not.toHaveBeenCalled();
  });

  // --- clearUnread ---

  test('clearUnread resets the unread count to 0', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({ type: 'turn_complete', data: {} });
    manager.handleSSEEvent({ type: 'bill_voted', data: {} });
    expect(manager.getUnreadCount()).toBe(2);

    manager.clearUnread();
    expect(manager.getUnreadCount()).toBe(0);
  });

  test('clearUnread calls mainWindow.setProgressBar(-1)', () => {
    manager.clearUnread();
    expect(win.setProgressBar).toHaveBeenCalledWith(-1);
  });

  // --- Unknown / generic SSE types are ignored (no notification spam) ---

  test('unknown event type does not show a notification', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({
      type: 'totally_unknown_event',
      data: { message: 'hello' },
    });

    expect(manager.getUnreadCount()).toBe(0);
    expect(Notification.prototype.show).not.toHaveBeenCalled();
  });

  test('SSE default event type "message" does not show a notification', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({ type: 'message', data: { foo: 1 } });

    expect(manager.getUnreadCount()).toBe(0);
    expect(Notification.prototype.show).not.toHaveBeenCalled();
  });

  test('explicit "notification" event type still notifies', () => {
    win.isFocused.mockReturnValue(false);
    manager.handleSSEEvent({
      type: 'notification',
      data: { message: 'Server-sent notice' },
    });

    expect(manager.getUnreadCount()).toBe(1);
    expect(Notification.prototype.show).toHaveBeenCalledTimes(1);
  });
});
