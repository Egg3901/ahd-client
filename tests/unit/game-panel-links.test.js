'use strict';

const {
  buildDefaultEntries,
  resolveEffectiveEntries,
  buildGamePanelMenuTemplate,
  normalizeStoredEntries,
  defaultPresetVisible,
  resolvePresetRoute,
  CREATE_CORPORATION_PATH,
} = require('../../src/game-panel-links');

describe('game-panel-links', () => {
  test('buildDefaultEntries includes ceo preset when CEO', () => {
    const m = { isCeo: true, myCorporationId: 42, campaignId: 1 };
    const entries = buildDefaultEntries(m);
    expect(
      entries.filter((e) => e.kind === 'preset').map((e) => e.id),
    ).toContain('ceo');
  });

  test('buildDefaultEntries still includes ceo preset when not CEO', () => {
    const m = { isCeo: false, myCorporationId: 42, campaignId: 1 };
    const entries = buildDefaultEntries(m);
    expect(entries.some((e) => e.kind === 'preset' && e.id === 'ceo')).toBe(
      true,
    );
  });

  test('resolveEffectiveEntries uses stored list when set', () => {
    const stored = [{ kind: 'preset', id: 'profile' }];
    const m = { isCeo: true, myCorporationId: 1 };
    expect(resolveEffectiveEntries(stored, m)).toEqual(stored);
  });

  test('resolvePresetRoute: CEO goes to dashboard when CEO + corp id', () => {
    const m = { isCeo: true, myCorporationId: 7 };
    expect(resolvePresetRoute('ceo', m)).toBe('/corporation/7/ceo');
  });

  test('resolvePresetRoute: non-CEO with corp opens corporation hub', () => {
    const m = { isCeo: false, myCorporationId: 7 };
    expect(resolvePresetRoute('ceo', m)).toBe('/corporation/7');
  });

  test('resolvePresetRoute: no corp id uses new-corporation path', () => {
    const m = { isCeo: false, myCorporationId: null };
    expect(resolvePresetRoute('ceo', m)).toBe(CREATE_CORPORATION_PATH);
  });

  test('buildGamePanelMenuTemplate: CEO without corp id still gets create item', () => {
    const m = { isCeo: true, myCorporationId: null, campaignId: null };
    const items = buildGamePanelMenuTemplate(
      m,
      [{ kind: 'preset', id: 'ceo' }],
      jest.fn(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Create a corporation');
  });

  test('buildGamePanelMenuTemplate: CEO + corp shows CEO label', () => {
    const m = { isCeo: true, myCorporationId: 9 };
    const items = buildGamePanelMenuTemplate(
      m,
      [{ kind: 'preset', id: 'ceo' }],
      jest.fn(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('CEO');
  });

  test('buildGamePanelMenuTemplate: non-CEO with corp shows My corporation', () => {
    const m = { isCeo: false, myCorporationId: 9 };
    const items = buildGamePanelMenuTemplate(
      m,
      [{ kind: 'preset', id: 'ceo' }],
      jest.fn(),
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('My corporation');
  });

  test('normalizeStoredEntries rejects invalid preset id', () => {
    expect(normalizeStoredEntries([{ kind: 'preset', id: 'nope' }])).toBeNull();
  });

  test('normalizeStoredEntries accepts custom link', () => {
    const out = normalizeStoredEntries([
      { kind: 'custom', label: 'Wiki', path: '/wiki' },
    ]);
    expect(out).toEqual([{ kind: 'custom', label: 'Wiki', path: '/wiki' }]);
  });

  test('defaultPresetVisible is always true for these presets', () => {
    expect(
      defaultPresetVisible('ceo', { isCeo: true, myCorporationId: 1 }),
    ).toBe(true);
    expect(defaultPresetVisible('ceo', { isCeo: false })).toBe(true);
    expect(defaultPresetVisible('profile', {})).toBe(true);
  });
});
