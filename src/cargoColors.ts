const CARGO_PALETTE = [
  '#93c5fd',
  '#86efac',
  '#fdba74',
  '#c4b5fd',
  '#fca5a5',
  '#67e8f9',
  '#fde68a',
  '#f9a8d4',
  '#99f6e4',
  '#a5b4fc',
  '#bef264',
  '#fed7aa',
];

function normalizeHex(value?: string): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return CARGO_PALETTE[Math.abs(hash) % CARGO_PALETTE.length];
}

function rgb(hex: string): [number, number, number] {
  const value = hex.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

function randomByte(min: number, max: number): number {
  const range = max - min + 1;
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    return min + (value % range);
  }
  return min + Math.floor(Math.random() * range);
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

export function randomUniqueCargoColor(usedColors: Iterable<string>): string {
  const used = [...usedColors].map(color => normalizeHex(color)).filter((color): color is string => Boolean(color));

  for (let attempt = 0; attempt < 600; attempt += 1) {
    // 너무 어둡거나 너무 하얀 색을 피하면서 RGB 공간에서 무작위 생성한다.
    const candidate = `#${toHex(randomByte(55, 220))}${toHex(randomByte(55, 220))}${toHex(randomByte(55, 220))}`;
    if (used.includes(candidate)) continue;
    // 단순히 값만 다른 색이 아니라 눈으로도 구분되도록 최소 거리를 둔다.
    if (used.every(existing => colorDistance(existing, candidate) >= 72)) return candidate;
  }

  // 박스 종류가 매우 많아 색 간격 확보가 어려워져도 정확히 같은 색은 절대 재사용하지 않는다.
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = `#${toHex(randomByte(35, 230))}${toHex(randomByte(35, 230))}${toHex(randomByte(35, 230))}`;
    if (!used.includes(candidate)) return candidate;
  }

  // 사실상 도달하지 않는 마지막 안전장치.
  let index = used.length + 1;
  while (true) {
    const candidate = `#${(index * 2654435761 % 0xffffff).toString(16).padStart(6, '0')}`;
    if (!used.includes(candidate)) return candidate;
    index += 1;
  }
}

export function cargoColor(id: string, assignedColor?: string): string {
  return normalizeHex(assignedColor) ?? hashColor(id);
}

export function cargoTint(id: string, assignedColor?: string): string {
  const hex = cargoColor(id, assignedColor).slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, .24)`;
}
