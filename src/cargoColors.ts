const CARGO_PALETTE = [
  '#2563eb', // blue
  '#16a34a', // green
  '#f97316', // orange
  '#7c3aed', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#ca8a04', // amber
  '#db2777', // pink
  '#0f766e', // teal
  '#4f46e5', // indigo
  '#65a30d', // lime
  '#c2410c', // deep orange
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
  return `rgba(${r}, ${g}, ${b}, .12)`;
}
