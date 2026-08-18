import type { ContainerSpec, Placement } from './types';

export type ZoneUtilization = {
  id: 'inside' | 'middle' | 'door';
  label: string;
  usedVolumeM3: number;
  capacityM3: number;
  fillPct: number;
  freePct: number;
  averageHeightM: number;
  maxHeightM: number;
  heightPct: number;
};

const EPS = 1e-9;
const HEIGHT_GRID_X = 14;
const HEIGHT_GRID_Y = 8;

function overlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function zoneHeightProfile(
  container: ContainerSpec,
  placements: Placement[],
  start: number,
  end: number,
) {
  const zoneLength = Math.max(EPS, end - start);
  let totalTop = 0;
  let maxHeightM = 0;
  let samples = 0;

  for (let ix = 0; ix < HEIGHT_GRID_X; ix += 1) {
    const x = start + (ix + 0.5) / HEIGHT_GRID_X * zoneLength;
    for (let iy = 0; iy < HEIGHT_GRID_Y; iy += 1) {
      const y = (iy + 0.5) / HEIGHT_GRID_Y * container.width;
      let top = 0;
      for (const p of placements) {
        const coversX = x >= p.x - EPS && x <= p.x + p.length + EPS;
        const coversY = y >= p.y - EPS && y <= p.y + p.width + EPS;
        if (coversX && coversY) top = Math.max(top, p.z + p.height);
      }
      totalTop += top;
      maxHeightM = Math.max(maxHeightM, top);
      samples += 1;
    }
  }

  return {
    averageHeightM: samples ? totalTop / samples : 0,
    maxHeightM,
  };
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
    const height = zoneHeightProfile(container, placements, zone.start, zone.end);
    const heightPct = container.height > EPS ? Math.min(100, height.averageHeightM / container.height * 100) : 0;
    return {
      id: zone.id,
      label: `${zone.label} · 평균 ${height.averageHeightM.toFixed(2)}m`,
      usedVolumeM3,
      capacityM3: capacity,
      fillPct,
      freePct: Math.max(0, 100 - fillPct),
      averageHeightM: height.averageHeightM,
      maxHeightM: height.maxHeightM,
      heightPct,
    };
  });
}

export function detectZoneFlowWarning(zones: ZoneUtilization[]): string | null {
  const inside = zones.find(z => z.id === 'inside');
  const middle = zones.find(z => z.id === 'middle');
  const door = zones.find(z => z.id === 'door');
  const insideFill = inside?.fillPct ?? 0;
  const middleFill = middle?.fillPct ?? 0;
  const doorFill = door?.fillPct ?? 0;

  if (inside && middle) {
    const averageSpike = middle.averageHeightM > inside.averageHeightM + 0.35 && middle.averageHeightM > inside.averageHeightM * 1.28;
    const peakSpike = middle.maxHeightM > inside.maxHeightM + 0.45 && middle.maxHeightM > inside.maxHeightM * 1.2;
    if (averageSpike || peakSpike) {
      return `중앙 구역 높이가 안쪽보다 과도하게 높습니다. 뿔 모양 적재를 확인하세요. 평균 높이 안쪽 ${inside.averageHeightM.toFixed(2)}m / 중앙 ${middle.averageHeightM.toFixed(2)}m, 최고 높이 안쪽 ${inside.maxHeightM.toFixed(2)}m / 중앙 ${middle.maxHeightM.toFixed(2)}m.`;
    }
  }

  if (middleFill > insideFill + 12) return '중앙 구역이 안쪽보다 많이 채워져 있습니다. 안쪽 우선 적재 결과를 확인하세요.';
  if (doorFill > middleFill + 18 && insideFill < 65) return '안쪽 여유가 큰데 문쪽 적재 비율이 높습니다. 후순위 적재 흐름을 확인하세요.';

  if (middle && door) {
    const doorSpike = door.averageHeightM > middle.averageHeightM + 0.45 && door.averageHeightM > middle.averageHeightM * 1.35;
    if (doorSpike) {
      return `문쪽 평균 적재 높이가 중앙보다 높습니다. 하역 안정성을 위해 문쪽 돌출 적재를 확인하세요. 중앙 ${middle.averageHeightM.toFixed(2)}m / 문쪽 ${door.averageHeightM.toFixed(2)}m.`;
    }
  }
  return null;
}
