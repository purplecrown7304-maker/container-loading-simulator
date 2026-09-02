import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContainerSpec, LoadingResult } from './engine/types';
import { usePhysicsTarget } from './physicsTarget';

export const BOX_VIEW_SNAPSHOT_EVENT = 'container-loading:box-view-snapshot';

type BoxViewSnapshot = {
  container: ContainerSpec;
  result: LoadingResult;
};

type SnapshotWindow = Window & {
  __containerLoadingBoxViewSnapshot?: BoxViewSnapshot;
};

function readBoxSnapshot() {
  if (typeof window === 'undefined') return undefined;
  return (window as SnapshotWindow).__containerLoadingBoxViewSnapshot;
}

export default function RemainingLengthIndicator() {
  const physicsTarget = usePhysicsTarget();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [boxSnapshot, setBoxSnapshot] = useState<BoxViewSnapshot | undefined>(readBoxSnapshot);

  useEffect(() => {
    let frame = 0;
    const locate = () => {
      const element = document.querySelector<HTMLElement>('.dashboard-left .dashboard-card:first-child .spec-list > span:first-child > b');
      setTarget(element);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(locate);
    };

    locate();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const onSnapshot = (event: Event) => {
      setBoxSnapshot((event as CustomEvent<BoxViewSnapshot | undefined>).detail);
    };
    window.addEventListener(BOX_VIEW_SNAPSHOT_EVENT, onSnapshot);
    return () => window.removeEventListener(BOX_VIEW_SNAPSHOT_EVENT, onSnapshot);
  }, []);

  const snapshot = physicsTarget?.mode === 'pallets'
    ? { container: physicsTarget.container, result: physicsTarget.result }
    : boxSnapshot;

  const remainingLengthMm = useMemo(() => {
    if (!snapshot || snapshot.result.placements.length === 0) return null;
    const occupiedEnd = snapshot.result.placements.reduce(
      (max, placement) => Math.max(max, placement.x + placement.length),
      0,
    );
    return Math.max(0, snapshot.container.length - occupiedEnd) * 1000;
  }, [snapshot]);

  if (!target || remainingLengthMm === null) return null;

  return createPortal(
    <small className="spec-remaining-length" title="컨테이너 안쪽부터 현재 적재 끝점까지를 제외한 문쪽 잔여 길이">
      남은 {Math.round(remainingLengthMm).toLocaleString()} mm
    </small>,
    target,
  );
}
