// Rasterize the same Korean font used by the app; Unity renders these textures on
// real box faces, with normal depth testing and no screen-space HTML overlays.
export async function labelsForPlan(plan) {
  await document.fonts.load('600 28px Pretendard');
  const labels = new Map();
  for (const box of plan.placements) {
    if (labels.has(box.cargoId)) continue;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#fffef9'; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 506, 250);
    ctx.fillStyle = box.color || '#2563eb'; ctx.fillRect(8, 8, 12, 240);
    const line = (text, y, size, weight = 600) => {
      ctx.fillStyle = '#172b42'; ctx.font = `${weight} ${size}px Pretendard, sans-serif`;
      let value = String(text || '');
      while (ctx.measureText(value).width > 452 && value.length > 1) value = value.slice(0, -1);
      if (value !== String(text || '')) value = value.slice(0, -1) + '…';
      ctx.fillText(value, 30, y, 454);
    };
    line(box.labelCode || box.cargoId, 52, 34, 700);
    line(box.labelTitle || box.cargoId, 103, 32, 700);
    line(box.labelDetail || `${box.weightKg} kg`, 165, 29);
    line(box.labelSize || `${box.length} × ${box.width} × ${box.height} m`, 213, 26);
    labels.set(box.cargoId, { cargoId: box.cargoId, png: canvas.toDataURL('image/png').split(',')[1] });
  }
  return { revision: plan.revision, labels: [...labels.values()] };
}
