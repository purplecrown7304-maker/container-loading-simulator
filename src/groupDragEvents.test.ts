import { describe, expect, it } from 'vitest';
import type { GroupDragDetail, GroupSelectionDetail } from './groupDragEvents';

describe('group drag event contracts', () => {
  it('keeps the selected block and relative movement explicit', () => {
    const detail: GroupDragDetail = { indices:[1,2,3], anchorIndex:2, delta:{x:-0.25,y:0.1,z:0} };
    expect(detail.indices).toEqual([1,2,3]);
    expect(detail.anchorIndex).toBe(2);
    expect(detail.delta.x).toBe(-0.25);
  });

  it('supports clearing a 3D group selection', () => {
    const detail: GroupSelectionDetail = { mode:null, indices:[], anchorIndex:null };
    expect(detail.indices).toHaveLength(0);
    expect(detail.mode).toBeNull();
  });
});
