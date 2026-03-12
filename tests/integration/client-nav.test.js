'use strict';

jest.mock('../../src/nav', () => ({
  getNavForCountry: jest.fn((id) => ({
    legislature: { route: `/legislature/${(id || 'us').toLowerCase()}`, label: id === 'UK' ? 'Parliament' : 'Congress' },
    executive:   { route: `/executive/${(id || 'us').toLowerCase()}`, label: 'Exec' },
    map:         { route: '/map', label: 'Map' },
    elections:   { route: '/elections?country=us' },
    parties:     { route: '/parties?country=us' },
    metrics:     { route: '/metrics?country=us' },
    policy:      { route: '/policy?country=us' },
    politicians: { route: '/politicians?country=us' },
    news:        { route: '/news?country=us' },
    presidentElection: id !== 'UK',
  })),
}));

const { getNavForCountry } = require('../../src/nav');
const MenuManager = require('../../src/menu');
const WindowManager = require('../../src/windows');
const { Menu } = require('electron');

describe('applyNavForCountry integration', () => {
  function makeMockWindow() {
    return {
      loadURL: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
      webContents: { executeJavaScript: jest.fn() },
    };
  }
  function makeMockWM() {
    return { getPresets: jest.fn().mockReturnValue([]), getPresetConfig: jest.fn(), openWindow: jest.fn() };
  }

  beforeEach(() => jest.clearAllMocks());

  test('UK manifest: menu shows Parliament, congress preset routes to /legislature/uk', () => {
    const nav = getNavForCountry('UK');
    const manifest = { currentParty: null, activePresidentElectionId: null };

    const mm = new MenuManager(makeMockWindow(), makeMockWM(), {});
    const wm = new WindowManager();

    mm.setNavConfig(nav, manifest);
    wm.updatePresets(nav);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const navigateMenu = template.find((m) => m.label === 'Navigate');
    expect(navigateMenu.submenu[0].label).toBe('Parliament');
    expect(wm.getPresetConfig('congress').route).toBe('/legislature/uk');
  });

  test('US manifest with presidentElection: Presidential Election item present', () => {
    const nav = getNavForCountry('US');
    const manifest = { currentParty: null, activePresidentElectionId: 'elec-999' };

    const mm = new MenuManager(makeMockWindow(), makeMockWM(), {});
    mm.setNavConfig(nav, manifest);

    const template = Menu.buildFromTemplate.mock.calls[0][0];
    const navigateMenu = template.find((m) => m.label === 'Navigate');
    const labels = navigateMenu.submenu.map((i) => i.label).filter(Boolean);
    expect(labels).toContain('Presidential Election');
  });
});
