'use strict';

const {
  corporationPathIdForUrl,
  stripCorporationEnrichment,
  mergeCharacterMeIntoManifest,
} = require('../../src/corporation-enrich');

describe('corporation-enrich', () => {
  test('corporationPathIdForUrl prefers pathId', () => {
    expect(
      corporationPathIdForUrl({
        pathId: 'corp-slug-1',
        sequentialId: 99,
      }),
    ).toBe('corp-slug-1');
  });

  test('corporationPathIdForUrl uses sequentialId 0', () => {
    expect(
      corporationPathIdForUrl({
        sequentialId: 0,
      }),
    ).toBe('0');
  });

  test('corporationPathIdForUrl falls back to _id when no pathId/sequential', () => {
    expect(
      corporationPathIdForUrl({
        sequentialId: null,
        _id: '674a1b2c3d4e5f6789012345',
      }),
    ).toBe('674a1b2c3d4e5f6789012345');
  });

  test('stripCorporationEnrichment removes myCorporationId and clears isCeo', () => {
    const m = { hasCharacter: true, myCorporationId: 'x', isCeo: true, a: 1 };
    const out = stripCorporationEnrichment(m);
    expect(out.myCorporationId).toBeUndefined();
    expect(out.isCeo).toBe(false);
    expect(out.a).toBe(1);
  });

  test('mergeCharacterMeIntoManifest: no character strips', () => {
    const m = { hasCharacter: false, myCorporationId: 'stale', isCeo: true };
    const out = mergeCharacterMeIntoManifest(m, {
      corporation: { pathId: 'ok' },
    });
    expect(out.myCorporationId).toBeUndefined();
    expect(out.isCeo).toBe(false);
  });

  test('mergeCharacterMeIntoManifest: null me strips', () => {
    const m = { hasCharacter: true, myCorporationId: 'stale', isCeo: true };
    const out = mergeCharacterMeIntoManifest(m, null);
    expect(out.myCorporationId).toBeUndefined();
    expect(out.isCeo).toBe(false);
  });

  test('mergeCharacterMeIntoManifest: corporation null strips', () => {
    const m = { hasCharacter: true, myCorporationId: 'stale', isCeo: true };
    const out = mergeCharacterMeIntoManifest(m, { corporation: null });
    expect(out.myCorporationId).toBeUndefined();
    expect(out.isCeo).toBe(false);
  });

  test('mergeCharacterMeIntoManifest: has corp with only pathId + ceoId match', () => {
    const m = { hasCharacter: true };
    const out = mergeCharacterMeIntoManifest(m, {
      character: { _id: 'charhex' },
      corporation: {
        pathId: 'my-corp-path',
        sequentialId: null,
        ceoId: 'charhex',
        name: 'Acme',
      },
    });
    expect(out.myCorporationId).toBe('my-corp-path');
    expect(out.isCeo).toBe(true);
  });

  test('mergeCharacterMeIntoManifest: nested character.corporation', () => {
    const m = { hasCharacter: true };
    const out = mergeCharacterMeIntoManifest(m, {
      corporation: null,
      character: {
        _id: 'c1',
        corporation: {
          pathId: 'nested-path',
          ceoId: 'other',
        },
      },
    });
    expect(out.myCorporationId).toBe('nested-path');
    expect(out.isCeo).toBe(false);
  });
});
