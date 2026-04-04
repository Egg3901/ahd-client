'use strict';

const { Menu } = require('electron');
const MenuManager = require('../../src/menu');
const config = require('../../src/config');

function makeMockWindow() {
  return {
    loadURL: jest.fn().mockResolvedValue(undefined),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      executeJavaScript: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeMockWindowManager() {
  return {
    getPresets: jest.fn().mockReturnValue(['elections']),
    getPresetConfig: jest.fn().mockReturnValue({
      title: 'Elections — A House Divided',
      route: '/elections',
    }),
    openWindow: jest.fn(),
  };
}

const manifestBase = {
  hasCharacter: true,
  characterCountryId: 'US',
  activePresidentElectionId: null,
  activePresidentElectionSeatId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.NODE_ENV;
});

afterEach(() => {
  delete process.env.NODE_ENV;
});

describe('MenuManager', () => {
  describe('build()', () => {
    it('calls Menu.buildFromTemplate', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    });

    it('calls Menu.setApplicationMenu with the built menu', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      const builtMenu = Menu.buildFromTemplate.mock.results[0].value;
      expect(Menu.setApplicationMenu).toHaveBeenCalledWith(builtMenu);
    });
  });

  describe('menu template labels', () => {
    function getTemplate() {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      return Menu.buildFromTemplate.mock.calls[0][0];
    }

    it('includes Game menu label', () => {
      const template = getTemplate();
      expect(template.map((m) => m.label)).toContain('Game');
    });

    it('includes Navigate menu label', () => {
      const template = getTemplate();
      expect(template.map((m) => m.label)).toContain('Navigate');
    });

    it('includes View menu label', () => {
      const template = getTemplate();
      expect(template.map((m) => m.label)).toContain('View');
    });

    it('includes Help menu label', () => {
      const template = getTemplate();
      expect(template.map((m) => m.label)).toContain('Help');
    });

    it('does NOT include Admin menu by default', () => {
      const template = getTemplate();
      expect(template.map((m) => m.label)).not.toContain('Admin');
    });
  });

  describe('setAdmin()', () => {
    it('setAdmin(true) rebuilds menu and Admin label appears', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      jest.clearAllMocks();

      mm.setAdmin(true);

      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.map((m) => m.label)).toContain('Admin');
    });

    it('setAdmin(false) removes Admin label', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, { isAdmin: true });
      mm.build();
      jest.clearAllMocks();

      mm.setAdmin(false);

      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.map((m) => m.label)).not.toContain('Admin');
    });
  });

  describe('Dev menu', () => {
    it('includes Developer menu when NODE_ENV === "development"', () => {
      process.env.NODE_ENV = 'development';
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.map((m) => m.label)).toContain('Developer');
    });

    it('excludes Developer menu when NODE_ENV !== "development"', () => {
      process.env.NODE_ENV = 'test';
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.build();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.map((m) => m.label)).not.toContain('Developer');
    });
  });

  describe('navigate()', () => {
    it('calls mainWindow.loadURL with the correct full URL', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.navigate('/elections');
      expect(win.loadURL).toHaveBeenCalledWith(`${config.GAME_URL}/elections`);
    });

    it('is a no-op when the window is destroyed', () => {
      const win = makeMockWindow();
      win.isDestroyed.mockReturnValue(true);
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win, wm, {});
      mm.navigate('/elections');
      expect(win.loadURL).not.toHaveBeenCalled();
    });
  });

  describe('theme change callback', () => {
    it('calls onThemeChange with "default" when the first theme item is clicked', () => {
      const win = makeMockWindow();
      const wm = makeMockWindowManager();
      const onThemeChange = jest.fn();
      const mm = new MenuManager(win, wm, { onThemeChange });
      mm.build();

      const template = Menu.buildFromTemplate.mock.calls[0][0];
      const viewMenu = template.find((m) => m.label === 'View');
      const themeItem = viewMenu.submenu.find((m) => m.label === 'Theme');
      themeItem.submenu[0].click();

      expect(onThemeChange).toHaveBeenCalledWith('default');
    });
  });

  describe('setNavConfig()', () => {
    function getNavigateSubmenu(mm) {
      mm.build();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      return template.find((m) => m.label === 'Navigate').submenu;
    }

    function findNation(mm) {
      const submenu = getNavigateSubmenu(mm);
      return submenu.find((m) => m.label === 'The Nation');
    }

    it('The Nation submenu starts with executive label (UK)', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('UK');
      mm.setNavConfig(nav, { ...manifestBase, characterCountryId: 'UK' });
      const nation = findNation(mm);
      expect(nation.submenu[0].label).toBe('10 Downing Street');
    });

    it('The Nation second item is legislature (UK)', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('UK');
      mm.setNavConfig(nav, { ...manifestBase, characterCountryId: 'UK' });
      const nation = findNation(mm);
      expect(nation.submenu[1].label).toBe('Parliament');
    });

    it('setNavConfig triggers a menu rebuild', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('DE');
      jest.clearAllMocks();
      mm.setNavConfig(nav, manifestBase);
      expect(Menu.buildFromTemplate).toHaveBeenCalledTimes(1);
    });

    it('My Party item is present when manifest.currentParty is set', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('US');
      mm.setNavConfig(nav, {
        ...manifestBase,
        currentParty: { id: 'p1', name: 'Democrats' },
      });
      const nation = findNation(mm);
      expect(
        nation.submenu.map((i) => i.label).some((l) => /^My Party/.test(l)),
      ).toBe(true);
    });

    it('My Party item is absent when manifest.currentParty is null', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('US');
      mm.setNavConfig(nav, { ...manifestBase, currentParty: null });
      const nation = findNation(mm);
      expect(
        nation.submenu.map((i) => i.label).some((l) => /^My Party/.test(l)),
      ).toBe(false);
    });

    it('Presidential Election item present for US with activePresidentElectionId', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('US');
      mm.setNavConfig(nav, {
        ...manifestBase,
        currentParty: null,
        activePresidentElectionId: 'elec-123',
      });
      const nation = findNation(mm);
      expect(nation.submenu.map((i) => i.label).filter(Boolean)).toContain(
        'Presidential Election',
      );
    });

    it('Presidential Election item absent for UK', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('UK');
      mm.setNavConfig(nav, {
        ...manifestBase,
        characterCountryId: 'UK',
        currentParty: null,
        activePresidentElectionId: 'elec-123',
      });
      const nation = findNation(mm);
      expect(nation.submenu.map((i) => i.label).filter(Boolean)).not.toContain(
        'Presidential Election',
      );
    });

    it('includes Account menu when manifest.user is set', () => {
      const mm = new MenuManager(makeMockWindow(), makeMockWindowManager(), {});
      const nav = require('../../src/nav').getNavForCountry('US');
      mm.setNavConfig(nav, {
        ...manifestBase,
        user: { username: 'u', isAdmin: false },
      });
      mm.build();
      const template = Menu.buildFromTemplate.mock.calls[0][0];
      expect(template.map((m) => m.label)).toContain('Account');
    });
  });

  describe('setWindow()', () => {
    it('updates the mainWindow reference', () => {
      const win1 = makeMockWindow();
      const win2 = makeMockWindow();
      const wm = makeMockWindowManager();
      const mm = new MenuManager(win1, wm, {});
      expect(mm.mainWindow).toBe(win1);
      mm.setWindow(win2);
      expect(mm.mainWindow).toBe(win2);
    });
  });
});
