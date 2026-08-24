import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import type { ContainerSpec } from './engine/types';

export type PreviewView = 'free' | 'rear' | 'top' | 'side';

export const BOX_LABEL_STORAGE_KEY = 'container-loading-show-box-labels';

export function readBoxLabelPreference(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(BOX_LABEL_STORAGE_KEY) !== 'false';
}

export function saveBoxLabelPreference(value: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOX_LABEL_STORAGE_KEY, String(value));
}

export function PreviewCameraController({
  view,
  container,
  scale,
}: {
  view: PreviewView;
  container: ContainerSpec;
  scale: number;
}) {
  const { camera } = useThree();
  const target: [number, number, number] = [0, Math.max(0.45, container.height * scale * 0.42), 0];

  useEffect(() => {
    if (view === 'free') return;
    const length = container.length * scale;
    const width = container.width * scale;
    const height = container.height * scale;
    const longDistance = Math.max(6.2, length * 1.22);
    const sideDistance = Math.max(6.2, length * 1.05, width * 3.2);
    const topDistance = Math.max(7.2, length * 1.18);

    if (view === 'rear') {
      camera.up.set(0, 1, 0);
      camera.position.set(-longDistance, Math.max(2.2, height * 1.45), 0);
    } else if (view === 'top') {
      camera.up.set(0, 0, -1);
      camera.position.set(0, topDistance, 0.001);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(0, Math.max(2.2, height * 1.45), sideDistance);
    }

    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, container.height, container.length, container.width, scale, target[1], view]);

  return <OrbitControls makeDefault target={target} minDistance={3.6} maxDistance={20} />;
}

export function PreviewViewControls({
  view,
  onViewChange,
  showLabels,
  onToggleLabels,
}: {
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
}) {
  const button = (value: Exclude<PreviewView, 'free'>, label: string) => (
    <button
      type="button"
      className={view === value ? 'active' : ''}
      onClick={() => onViewChange(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="preview-view-controls" aria-label="미리보기 방향 제어">
      <div className="preview-view-buttons">
        {button('rear', '후면')}
        {button('top', '상단')}
        {button('side', '옆면')}
      </div>
      <button
        type="button"
        className={`preview-label-toggle ${showLabels ? 'active' : ''}`}
        onClick={onToggleLabels}
        aria-pressed={showLabels}
      >
        박스정보 {showLabels ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
