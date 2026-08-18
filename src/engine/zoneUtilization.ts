import type { ContainerSpec, Placement } from './types';

export type ZoneUtilization = {
  id: 'inside' | 'middle' | 'door';
  label: string;
  usedVolumeM3: number;
  capacityM3: number;
  fillPct: number;
  freePct: number;
};

const EPS = 1e-9;

function overlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function assessZoneUtilization(container: ContainerSpec, placements: Placement[]): ZoneUtilization[] {
  const zoneLength = container.length / 3;
  const capacity = zoneLength * container.width * container.height;
  const definitions: Array<{ id: ZoneUtilization['id']; label: string; start: number; end: number }> = [
    { id: 'inside', label: '안쪽', start: 0, end: zoneLength },
    { id: 'middle', label: '중앙', start: zoneLength, end: zoneLength * 2 },
    { id: 'door', label: '문쪽', start: zoneLength * 2, end: container.length },
  ];

  return definitions.map(zone => {
    const usedVolumeM3 = placements.reduce((sum, p) => {
      const overlapX = overlapLength(p.x, p.x + p.length, zone.start, zone.end);
      if (overlapX <= EPS) return sum;
      return sum + overlapX * p.width * p.height;
    }, 0);
    const fillPct = capacity > EPS ? Math.min(100, usedVolumeM3 / capacity * 100) : 0;
    return {
      id: zone.id,
      label: zone.label,
      usedVolumeM3,
      capacityM3: capacity,
      fillPct,
      freePct: Math.max(0, 100 - fillPct),
    };
  });
}

export function detectZoneFlowWarning(zones: ZoneUtilization[]): string | null {
  const inside = zones.find(z => z.id === 'inside')?.fillPct ?? 0;
  const middle = zones.find(z => z.id === 'middle')?.fillPct ?? 0;
  const door = zones.find(z => z.id === 'door')?.fillPct ?? 0;
  if (middle > inside + 12) return '중앙 구역이 안쪽보다 많이 채워져 있습니다. 안쪽 우선 적재 결과를 확인하세요.';
  if (door > middle + 18 && inside < 65) return '안쪽 여유가 큰데 문쪽 적재 비율이 높습니다. 후순위 적재 흐름을 확인하세요.';
  return null;
}
