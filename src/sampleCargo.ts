import type { CargoItem } from './engine/types';

type SampleCargoTemplate = Omit<CargoItem, 'quantity'> & {
  minQuantity: number;
  maxQuantity: number;
};

const SAMPLE_CARGO_POOL: SampleCargoTemplate[] = [
  { id: 'BOX-001', name: '소형 경량', length: 0.32, width: 0.24, height: 0.18, weightKg: 6, maxStackLayers: 8, maxTopLoadKg: 90, allowRotation: true, minQuantity: 30, maxQuantity: 70 },
  { id: 'BOX-002', name: '소형 표준', length: 0.42, width: 0.3, height: 0.25, weightKg: 10, maxStackLayers: 7, maxTopLoadKg: 120, allowRotation: true, minQuantity: 25, maxQuantity: 65 },
  { id: 'BOX-003', name: '중형 표준', length: 0.5, width: 0.35, height: 0.3, weightKg: 14, maxStackLayers: 7, maxTopLoadKg: 140, allowRotation: true, minQuantity: 22, maxQuantity: 60 },
  { id: 'BOX-004', name: '중형 가로형', length: 0.6, width: 0.4, height: 0.35, weightKg: 20, maxStackLayers: 6, maxTopLoadKg: 180, allowRotation: true, minQuantity: 20, maxQuantity: 55 },
  { id: 'BOX-005', name: '중형 중량', length: 0.55, width: 0.45, height: 0.32, weightKg: 22, maxStackLayers: 6, maxTopLoadKg: 200, allowRotation: true, minQuantity: 18, maxQuantity: 50 },
  { id: 'BOX-006', name: '대형 표준', length: 0.7, width: 0.5, height: 0.42, weightKg: 32, maxStackLayers: 5, maxTopLoadKg: 240, allowRotation: true, minQuantity: 18, maxQuantity: 42 },
  { id: 'BOX-007', name: '대형 중량', length: 0.8, width: 0.55, height: 0.45, weightKg: 38, maxStackLayers: 4, maxTopLoadKg: 260, allowRotation: true, minQuantity: 16, maxQuantity: 36 },
  { id: 'BOX-008', name: '고중량 박스', length: 0.45, width: 0.4, height: 0.3, weightKg: 45, maxStackLayers: 4, maxTopLoadKg: 300, allowRotation: true, minQuantity: 16, maxQuantity: 40 },
  { id: 'BOX-009', name: '장축 박스', length: 0.9, width: 0.35, height: 0.3, weightKg: 28, maxStackLayers: 5, maxTopLoadKg: 220, allowRotation: true, minQuantity: 18, maxQuantity: 40 },
  { id: 'BOX-010', name: '평판형 박스', length: 0.65, width: 0.5, height: 0.22, weightKg: 16, maxStackLayers: 7, maxTopLoadKg: 170, allowRotation: true, minQuantity: 22, maxQuantity: 58 },
];

let previousSampleSignature = '';

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffled<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildSample() {
  const typeCount = randomInt(3, 5);
  return shuffled(SAMPLE_CARGO_POOL)
    .slice(0, typeCount)
    .map(({ minQuantity, maxQuantity, ...template }) => ({
      ...template,
      quantity: randomInt(minQuantity, maxQuantity),
    }));
}

export function createRandomSampleCargo(): CargoItem[] {
  let sample = buildSample();
  let signature = sample.map((item) => `${item.id}:${item.quantity}`).sort().join('|');

  for (let attempt = 0; attempt < 8 && signature === previousSampleSignature; attempt += 1) {
    sample = buildSample();
    signature = sample.map((item) => `${item.id}:${item.quantity}`).sort().join('|');
  }

  previousSampleSignature = signature;
  return sample;
}
