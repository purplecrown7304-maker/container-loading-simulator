import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color } from 'three';
import { createViewerEnvironmentResources } from './threeViewerEnvironmentResources';
import type { EnvironmentId } from './viewerEnvironment';

export type EnvironmentStatus = { id: EnvironmentId; status: 'ready' | 'fallback' };
type Props = {
  id: EnvironmentId;
  length: number;
  width: number;
  height: number;
  groundY?: number;
  attempt?: number;
  onStatus?: (status: EnvironmentStatus) => void;
};

/** View-only scenery owns no cargo, camera, picking or physics state. */
export default function ThreeViewerEnvironment({ id, length, width, height, groundY = -.14, attempt, onStatus }: Props) {
  const { scene, camera, invalidate } = useThree();
  const active = useRef<ReturnType<typeof createViewerEnvironmentResources> | null>(null);
  const callback = useRef(onStatus); callback.current = onStatus;
  useFrame(() => { active.current?.updateCamera(camera.position); });
  useLayoutEffect(() => {
    const previousBackground = scene.background;
    let environment: ReturnType<typeof createViewerEnvironmentResources> | undefined;
    try {
      environment = createViewerEnvironmentResources(id, { length, width, height });
      environment.root.position.y = groundY + .14;
      environment.updateCamera(camera.position);
      active.current = environment;
      scene.add(environment.root);
      scene.background = environment.background;
      callback.current?.({ id, status: 'ready' });
    } catch {
      // Keep the cargo canvas usable even if decorative resources cannot be created.
      if (environment) { scene.remove(environment.root); environment.dispose(); environment = undefined; }
      active.current = null;
      scene.background = new Color('#ecf3f9');
      callback.current?.({ id, status: 'fallback' });
    }
    invalidate();
    return () => {
      if (environment) { scene.remove(environment.root); environment.dispose(); }
      active.current = null;
      scene.background = previousBackground;
      invalidate();
    };
  }, [scene, camera, invalidate, id, length, width, height, groundY, attempt]);
  return null;
}
