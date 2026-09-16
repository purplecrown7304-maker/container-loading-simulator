import { describe, expect, it } from 'vitest';
import { chooseMemberSyncDirection, hasMemberCatalogData } from './memberCloudSyncPolicy';

describe('member cloud sync policy', () => {
  it('does not let an empty new computer overwrite existing cloud data', () => {
    expect(chooseMemberSyncDirection({ remoteExists: true, localDirty: false, localHasData: false })).toBe('download');
  });

  it('uploads the original browser catalog when cloud data does not exist yet', () => {
    expect(chooseMemberSyncDirection({ remoteExists: false, localDirty: false, localHasData: true })).toBe('upload');
  });

  it('uploads local edits that were made while offline', () => {
    expect(chooseMemberSyncDirection({ remoteExists: true, localDirty: true, localHasData: true })).toBe('upload');
  });

  it('uploads an intentional full deletion instead of resurrecting remote rows', () => {
    expect(chooseMemberSyncDirection({ remoteExists: true, localDirty: true, localHasData: false })).toBe('upload');
  });

  it('recognizes company products and personal boxes as member data', () => {
    expect(hasMemberCatalogData({ plannerState: { products: [{ id: 'P1' }], boxes: [] }, personalBoxes: [] })).toBe(true);
    expect(hasMemberCatalogData({ plannerState: null, personalBoxes: [{ id: 'B1' }] })).toBe(true);
    expect(hasMemberCatalogData({ plannerState: { products: [], boxes: [] }, personalBoxes: [] })).toBe(false);
  });
});
