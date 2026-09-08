import { isAdminSession } from './adminAccess';

const STORAGE_KEY = 'container-loading:equipment-image-overrides:v1';
export const EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT = 'equipment-image-overrides-updated';

export type EquipmentImageOverrides = Record<string, string>;

export function readEquipmentImageOverrides(): EquipmentImageOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].startsWith('data:image/')),
    );
  } catch {
    return {};
  }
}

function assertAdminImageAccess() {
  if (!isAdminSession()) throw new Error('관리자 계정으로 로그인한 경우에만 장비 이미지를 수정할 수 있습니다.');
}

function writeEquipmentImageOverrides(next: EquipmentImageOverrides) {
  assertAdminImageAccess();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EQUIPMENT_IMAGE_OVERRIDES_UPDATED_EVENT));
}

export function setEquipmentImageOverride(equipmentId: string, dataUrl: string) {
  assertAdminImageAccess();
  const next = { ...readEquipmentImageOverrides(), [equipmentId]: dataUrl };
  writeEquipmentImageOverrides(next);
  return next;
}

export function removeEquipmentImageOverride(equipmentId: string) {
  assertAdminImageAccess();
  const next = { ...readEquipmentImageOverrides() };
  delete next[equipmentId];
  writeEquipmentImageOverrides(next);
  return next;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('지원하지 않거나 손상된 이미지입니다.'));
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

function renderCompressed(image: HTMLImageElement, maxWidth: number, maxHeight: number, quality: number) {
  const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('브라우저에서 이미지 편집 캔버스를 만들지 못했습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/webp', quality);
}

export async function prepareEquipmentImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('PNG, JPG, WEBP 같은 이미지 파일만 선택하세요.');
  if (file.size > 12 * 1024 * 1024) throw new Error('이미지 파일은 12MB 이하로 선택하세요.');

  const image = await loadImage(file);
  const attempts = [
    [960, 600, 0.88],
    [840, 525, 0.84],
    [720, 450, 0.80],
    [600, 375, 0.76],
  ] as const;

  let dataUrl = '';
  for (const [width, height, quality] of attempts) {
    dataUrl = renderCompressed(image, width, height, quality);
    if (dataUrl.length <= 260_000) break;
  }
  if (!dataUrl.startsWith('data:image/')) throw new Error('이미지 변환에 실패했습니다.');
  return dataUrl;
}
