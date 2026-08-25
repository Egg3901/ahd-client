'use strict';

const DashboardPoller = require('../../src/dashboard');

describe('DashboardPoller', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls immediately on start()', () => {
    jest.useFakeTimers();
    const poller = new DashboardPoller();
    const fetchSpy = jest
      .spyOn(poller, '_fetch')
      .mockResolvedValue({ funds: 100 });
    const callback = jest.fn();

    poller.start(callback);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('setPollInterval() restarts the fallback timer at the new period', () => {
    jest.useFakeTimers();
    const poller = new DashboardPoller();
    const fetchSpy = jest
      .spyOn(poller, '_fetch')
      .mockResolvedValue({ funds: 100 });

    poller.start(() => {});
    jest.advanceTimersByTime(30_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + one 30s tick

    poller.setPollInterval(60_000);
    fetchSpy.mockClear();
    jest.advanceTimersByTime(30_000);
    expect(fetchSpy).not.toHaveBeenCalled(); // old 30s timer was replaced
    jest.advanceTimersByTime(30_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 60s boundary reached

    poller.stop();
  });

  it('setPollInterval() ignores values below the 5s floor', () => {
    const poller = new DashboardPoller();
    poller.setPollInterval(10);
    // Internal period must remain unchanged; verified via behaviour below.
    jest.useFakeTimers();
    const fetchSpy = jest.spyOn(poller, '_fetch').mockResolvedValue(null);
    poller.start(() => {});
    jest.advanceTimersByTime(4_999);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // still just the initial poll
    poller.stop();
    jest.useRealTimers();
  });
});
