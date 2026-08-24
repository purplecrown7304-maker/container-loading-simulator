const CARGO_PALETTE = [
  '#93c5fd', // soft blue
  '#86efac', // soft green
  '#fdba74', // soft orange
  '#c4b5fd', // soft violet
  '#fca5a5', // soft red
  '#67e8f9', // soft cyan
  '#fde68a', // soft amber
  '#f9a8d4', // soft pink
  '#99f6e4', // soft teal
  '#a5b4fc', // soft indigo
  '#bef264', // soft lime
  '#fed7aa', // soft peach
];

export function cargoColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return CARGO_PALETTE[Math.abs(hash) % CARGO_PALETTE.length];
}

export function cargoTint(id: string): string {
  const hex = cargoColor(id).slice(1);
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, .24)`;
}
