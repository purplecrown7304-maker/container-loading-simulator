import { describe, expect, it } from 'vitest';
import { buildLoadingReportHtml } from './report';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';

const container: ContainerSpec = { length: 12.03, width: 2.35, height: 2.69, maxPayloadKg: 26500 };
const cargo: CargoItem[] = [{ id: 'BOX-A', name: '<b>BOX A</b>', length: 0.6, width: 0.4, height: 0.35, weightKg: 18, quantity: 2 }];
const result: LoadingResult = {
  placements: [{ cargoId: 'BOX-A', x: 0, y: 0, z: 0, length: 0.6, width: 0.4, height: 0.35, weightKg: 18 }],
  remaining: [{ cargoId: 'BOX-A', quantity: 1, reason: '<script>alert(1)</script>' }],
  loadedWeightKg: 18,
  usedVolumeM3: 0.084,
  validationIssues: [],
};

describe('loading report', () => {
  it('renders summary and escapes user-provided text', () => {
    const html = buildLoadingReportHtml(container, cargo, result);
    expect(html).toContain('컨테이너 적재 작업지시서');
    expect(html).toContain('BOX-A');
    expect(html).toContain('&lt;b&gt;BOX A&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
