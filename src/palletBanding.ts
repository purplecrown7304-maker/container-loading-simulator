/** Pallet top-view axes: length is horizontal (X), width is vertical (Y). */
export function palletBandingLayout(strapCount: number) {
  const count = Math.max(0, Math.round(Number.isFinite(strapCount) ? strapCount : 0));
  const positions = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
  return {
    acrossLength: positions(Math.floor(count / 2)),
    acrossWidth: positions(Math.ceil(count / 2)),
  };
}

export function palletBandingLabel(strapCount: number) {
  const { acrossLength, acrossWidth } = palletBandingLayout(strapCount);
  return `가로 ${acrossLength.length}줄 + 세로 ${acrossWidth.length}줄 격자`;
}

/** Keep the existing joint allowance; each direction uses its own pallet span. */
export function palletBandingLengthM(length: number, width: number, loadHeight: number, strapCount: number) {
  const { acrossLength, acrossWidth } = palletBandingLayout(strapCount);
  return acrossLength.length * (2 * (length + loadHeight) + .3)
    + acrossWidth.length * (2 * (width + loadHeight) + .3);
}

type BandingEnvelope = { x: number; y: number; z: number; length: number; width: number; height: number };

/** Top and side pieces in the engine's Z-up coordinates; shared by all 3D viewers. */
export function palletBandingSegments(load: BandingEnvelope, strapCount: number, thickness = .022): BandingEnvelope[] {
  const { acrossLength, acrossWidth } = palletBandingLayout(strapCount);
  const segments: BandingEnvelope[] = [];
  const top = load.z + load.height;
  for (const ratio of acrossWidth) {
    const x = load.x + load.length * ratio - thickness / 2;
    segments.push({ x, y: load.y - thickness, z: top, length: thickness, width: load.width + thickness * 2, height: thickness });
    for (const y of [load.y - thickness, load.y + load.width]) {
      segments.push({ x, y, z: load.z, length: thickness, width: thickness, height: load.height });
    }
  }
  for (const ratio of acrossLength) {
    const y = load.y + load.width * ratio - thickness / 2;
    segments.push({ x: load.x - thickness, y, z: top, length: load.length + thickness * 2, width: thickness, height: thickness });
    for (const x of [load.x - thickness, load.x + load.length]) {
      segments.push({ x, y, z: load.z, length: thickness, width: thickness, height: load.height });
    }
  }
  return segments;
}
