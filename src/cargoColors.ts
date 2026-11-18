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

function toHex(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

/** 박스 종류 색은 모두 이 파스텔 범위 안에서 색상(hue)으로 구분한다. */
const PASTEL = { saturation: [0.62, 0.82], lightness: [0.70, 0.80] } as const;

function hsl(hex: string) {
  const [r, g, b] = rgb(hex).map(value => value / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  if (delta < 1e-9) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = ((hue % 360) + 360) % 360 / 60;
  const second = chroma * (1 - Math.abs(segment % 2 - 1));
  const [r, g, b] = segment < 1 ? [chroma, second, 0] : segment < 2 ? [second, chroma, 0] : segment < 3 ? [0, chroma, second]
    : segment < 4 ? [0, second, chroma] : segment < 5 ? [second, 0, chroma] : [chroma, 0, second];
  const base = lightness - chroma / 2;
  return `#${toHex((r + base) * 255)}${toHex((g + base) * 255)}${toHex((b + base) * 255)}`;
}

function inPastelRange(hex: string) {
  const color = hsl(hex);
  // 밝은 무채색(회색 계열 지정색의 변환 결과)도 그대로 둔다.
  return (color.saturation >= PASTEL.saturation[0] - 0.02 || color.saturation <= 0.2)
    && color.lightness >= PASTEL.lightness[0] - 0.01 && color.lightness <= PASTEL.lightness[1] + 0.01;
}

/**
 * 같은 색상(hue)의 파스텔 색으로 바꾼다. 예전에 저장된 진한 색도 화면·보고서에서는
 * 항상 파스텔로 보이고, 원래의 채도·명도 차이는 범위 안에서 유지되어 서로 구분된다.
 */
export function pastelCargoColor(color: string): string {
  const hex = normalizeHex(color);
  if (!hex) return CARGO_PALETTE[0];
  if (inPastelRange(hex)) return hex;
  const source = hsl(hex);
  if (source.saturation < 0.08) return hslToHex(215, 0.18, PASTEL.lightness[0] + (PASTEL.lightness[1] - PASTEL.lightness[0]) * source.lightness);
  return hslToHex(
    source.hue,
    PASTEL.saturation[0] + (PASTEL.saturation[1] - PASTEL.saturation[0]) * Math.min(1, source.saturation),
    PASTEL.lightness[0] + (PASTEL.lightness[1] - PASTEL.lightness[0]) * Math.min(1, Math.max(0, source.lightness)),
  );
}

/**
 * 새 박스 종류의 색. 이미 쓰인 색들과 색상환에서 가장 멀리 떨어진 파스텔 색을 고른다.
 * 종류가 많아져 색상 간격이 좁아지면 명도·채도 단계를 바꿔 같은 색은 다시 쓰지 않는다.
 */
export function randomUniqueCargoColor(usedColors: Iterable<string>): string {
  const used = [...usedColors].map(color => normalizeHex(color)).filter((color): color is string => Boolean(color)).map(pastelCargoColor);
  const hues = used.map(color => hsl(color)).filter(color => color.saturation >= 0.08).map(color => color.hue).sort((a, b) => a - b);
  let hue = 205;
  if (hues.length === 1) hue = (hues[0] + 137.5) % 360;
  else if (hues.length > 1) {
    let widest = -1;
    hues.forEach((start, index) => {
      const end = index + 1 < hues.length ? hues[index + 1] : hues[0] + 360;
      if (end - start > widest) { widest = end - start; hue = (start + (end - start) / 2) % 360; }
    });
  }
  const steps = 5;
  for (let attempt = 0; attempt < 720 * steps * steps; attempt += 1) {
    const turn = Math.floor(attempt / (steps * steps));
    const lightnessStep = attempt % steps, saturationStep = Math.floor(attempt / steps) % steps;
    const candidate = hslToHex(
      hue + turn * 0.5,
      PASTEL.saturation[1] - (PASTEL.saturation[1] - PASTEL.saturation[0]) * saturationStep / (steps - 1),
      PASTEL.lightness[0] + (PASTEL.lightness[1] - PASTEL.lightness[0]) * ((lightnessStep * 2 + 2) % steps) / (steps - 1),
    );
    if (!used.includes(candidate) && (attempt >= steps * steps || used.every(existing => colorDistance(existing, candidate) >= 24))) return candidate;
  }
  // 사실상 도달하지 않는 마지막 안전장치.
  let index = used.length + 1;
  while (true) {
    const candidate = hslToHex(index * 137.508, PASTEL.saturation[1], PASTEL.lightness[0] + (index % 97) / 970);
    if (!used.includes(candidate)) return candidate;
    index += 1;
  }
}

/** 화면에 쓰는 박스 종류 색. 지정된 색이 있으면 그 색상(hue)의 파스텔, 없으면 ID로 정한 파스텔. */
export function cargoColor(id: string, assignedColor?: string): string {
  const assigned = normalizeHex(assignedColor);
  return assigned ? pastelCargoColor(assigned) : hashColor(id);
}

export function cargoTint(id: string, assignedColor?: string): string {
  const hex = cargoColor(id, assignedColor).slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, .24)`;
}
