import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import { TRANSPORT_EQUIPMENT_EVENT, useTransportEquipment } from './transportEquipment';

const STORAGE_KEY = 'container-loading-equipment-visual-images-v1';
const VISUAL_EVENT = 'container-loading:equipment-visual-image-updated';

type EquipmentVisualMap = Record<string, string>;

function readVisuals(): EquipmentVisualMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as EquipmentVisualMap : {};
  } catch {
    return {};
  }
}

function writeVisuals(value: EquipmentVisualMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(VISUAL_EVENT));
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('지원하지 않는 이미지입니다.'));
      image.onload = () => {
        const maxWidth = 1600;
        const maxHeight = 900;
        const ratio = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('이미지 처리에 실패했습니다.'));
        context.fillStyle = '#f7f8fa';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.86));
      };
      image.src = String(reader.result ?? '');
    };
    reader.readAsDataURL(file);
  });
}

export default function EquipmentVisualAdminEditor() {
  const equipment = useTransportEquipment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAdmin, setIsAdmin] = useState(() => isAdminSession());
  const [visualHost, setVisualHost] = useState<HTMLButtonElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const syncAdmin = () => setIsAdmin(isAdminSession());
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
    window.addEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
    window.addEventListener(VISUAL_EVENT, refresh);
    return () => {
      window.removeEventListener(ADMIN_ACCESS_EVENT, syncAdmin);
      window.removeEventListener(TRANSPORT_EQUIPMENT_EVENT, refresh);
      window.removeEventListener(VISUAL_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let currentVisual: HTMLButtonElement | null = null;
    let currentToolbar: HTMLElement | null = null;
    let hiddenCard: HTMLElement | null = null;

    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>('.guided-equipment-stage>.guided-equipment-card.selected');
        if (card && card !== hiddenCard) {
          if (hiddenCard) hiddenCard.style.display = '';
          hiddenCard = card;
          hiddenCard.style.display = 'none';
        }

        const next = document.querySelector<HTMLButtonElement>('.guided-equipment-stage .guided-equipment-visual');
        if (next === currentVisual) return;
        currentToolbar?.remove();
        currentVisual = next;
        currentToolbar = null;
        setVisualHost(next);
        if (next) {
          next.style.position = 'relative';
          const toolbar = document.createElement('div');
          toolbar.style.margin = '-8px 0 16px';
          next.insertAdjacentElement('afterend', toolbar);
          currentToolbar = toolbar;
          setToolbarHost(toolbar);
        } else {
          setToolbarHost(null);
        }
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      currentToolbar?.remove();
      if (hiddenCard) hiddenCard.style.display = '';
    };
  }, []);

  useEffect(() => {
    if (!visualHost) return;
    const visuals = readVisuals();
    const custom = visuals[equipment.id];
    const svg = visualHost.querySelector<SVGElement>('svg');
    let image = visualHost.querySelector<HTMLImageElement>('img.equipment-custom-visual');

    if (custom) {
      if (!image) {
        image = document.createElement('img');
        image.className = 'equipment-custom-visual';
        image.style.display = 'block';
        image.style.width = '100%';
        image.style.aspectRatio = '760 / 260';
        image.style.objectFit = 'contain';
        image.style.background = '#f7f8fa';
        visualHost.prepend(image);
      }
      image.src = custom;
      image.alt = `${equipment.shortName} 적재공간 이미지`;
      if (svg) svg.style.display = 'none';
    } else {
      image?.remove();
      if (svg) svg.style.display = '';
    }
  }, [visualHost, equipment.id, equipment.shortName, revision]);

  const upload = async (file: File | undefined) => {
    if (!file || !isAdmin) return;
    if (!file.type.startsWith('image/')) return setMessage('이미지 파일만 등록할 수 있습니다.');
    if (file.size > 10 * 1024 * 1024) return setMessage('이미지는 10MB 이하 파일을 사용하세요.');
    try {
      const dataUrl = await resizeImage(file);
      writeVisuals({ ...readVisuals(), [equipment.id]: dataUrl });
      setMessage(`${equipment.shortName} 이미지를 변경했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '이미지를 변경하지 못했습니다.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const restore = () => {
    if (!isAdmin) return;
    const visuals = readVisuals();
    if (!visuals[equipment.id]) return setMessage('현재 기본 그림을 사용 중입니다.');
    const next = { ...visuals };
    delete next[equipment.id];
    writeVisuals(next);
    setMessage(`${equipment.shortName} 기본 그림으로 복원했습니다.`);
  };

  if (!toolbarHost || !isAdmin) return null;

  const buttonStyle = {
    padding: '6px 10px',
    border: '1px solid #cfd5dc',
    borderRadius: 8,
    background: '#fff',
    color: '#313841',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;

  return createPortal(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', padding: '8px 10px', border: '1px dashed #c9d0d8', borderRadius: 10, background: '#fafbfc' }} aria-label="관리자 적재공간 이미지 관리">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
      <span style={{ marginRight: 'auto', color: '#6f7781', fontSize: 11, fontWeight: 700 }}>관리자 이미지 관리</span>
      <button type="button" style={buttonStyle} onClick={() => inputRef.current?.click()}>이미지 변경</button>
      <button type="button" style={buttonStyle} onClick={restore}>기본 그림 복원</button>
      {message && <small style={{ flexBasis: '100%', color: '#66707a', fontSize: 10.5, textAlign: 'right' }}>{message}</small>}
    </div>,
    toolbarHost,
  );
}
