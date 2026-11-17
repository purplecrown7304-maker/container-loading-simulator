import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DirectionalLight, Mesh, Object3D, PCFSoftShadowMap, PMREMGenerator, Vector3, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type SceneLightingQuality = 'high' | 'standard' | 'performance';
export function createStudioEnvironmentResources(renderer: WebGLRenderer) {
  const room = new RoomEnvironment(); let generator: PMREMGenerator | undefined;
  try {
    generator = new PMREMGenerator(renderer);
    // One bake for this renderer, not per frame or per quality/camera change.
    const target = generator.fromScene(room, .04, .1, 100, { size: 256 });
    let disposed = false;
    return { texture: target.texture, dispose() { if (!disposed) { disposed = true; target.dispose(); } } };
  } finally { room.dispose(); generator?.dispose(); }
}

/** Lighting is independent of the selected decorative background. Standard PBR
 * materials receive this room IBL, direct light and bounded real shadow maps. */
export default function ThreeSceneLighting({ quality, groundY, onError }: { quality: SceneLightingQuality; groundY?: number; onError?: (message: string) => void }) {
  const { gl, scene, invalidate } = useThree();
  const callback = useRef(onError); callback.current = onError;
  const keyLight = useRef<DirectionalLight>(null), target = useMemo(() => new Object3D(), []);
  const catcher = useRef<Mesh>(null);
  const offset = useMemo(() => new Vector3(-8, 14, 10), []);
  useEffect(() => {
    const previous = scene.environment, intensity = scene.environmentIntensity;
    let resources: ReturnType<typeof createStudioEnvironmentResources> | undefined;
    try { resources = createStudioEnvironmentResources(gl); scene.environment = resources.texture; scene.environmentIntensity = .8; invalidate(); }
    catch (error) { callback.current?.(error instanceof Error ? error.message : String(error)); }
    return () => { if (resources && scene.environment === resources.texture) { scene.environment = previous; scene.environmentIntensity = intensity; } resources?.dispose(); invalidate(); };
  }, [gl, scene, invalidate]);
  useEffect(() => {
    const enabled = gl.shadowMap.enabled, type = gl.shadowMap.type;
    gl.shadowMap.enabled = quality !== 'performance'; gl.shadowMap.type = PCFSoftShadowMap; gl.shadowMap.needsUpdate = true; invalidate();
    return () => { gl.shadowMap.enabled = enabled; gl.shadowMap.type = type; gl.shadowMap.needsUpdate = true; };
  }, [gl, quality, invalidate]);
  useFrame(state => {
    const focus = (state.controls as unknown as { target?: Vector3 } | null)?.target;
    if (focus && catcher.current) { catcher.current.position.x = focus.x; catcher.current.position.z = focus.z; }
    if (!focus || !keyLight.current) return;
    const moved = target.position.distanceToSquared(focus) >= 1e-8;
    target.position.copy(focus); keyLight.current.position.copy(focus).add(offset);
    if (moved) { target.updateMatrixWorld(); gl.shadowMap.needsUpdate = true; }
  });
  const shadowSize = quality === 'high' ? 2048 : 1024;
  return <>
    <primitive object={target} dispose={null} />
    <hemisphereLight args={['#f7faff', '#879099', .6]} />
    <directionalLight key={shadowSize} ref={keyLight} target={target} position={[-8, 14, 10]} color="#fff7eb" intensity={2.4}
      castShadow={quality !== 'performance'} shadow-mapSize-width={shadowSize} shadow-mapSize-height={shadowSize}
      shadow-camera-left={-24} shadow-camera-right={24} shadow-camera-top={24} shadow-camera-bottom={-24}
      shadow-camera-near={.1} shadow-camera-far={80} shadow-bias={-.00002} shadow-normalBias={.003} shadow-radius={2} />
    <directionalLight position={[6, 8, -6]} color="#dce8ff" intensity={.65} />
    {quality !== 'performance' && groundY !== undefined && <mesh ref={catcher} rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY + .002, 0]} receiveShadow raycast={() => {}}>
      <planeGeometry args={[120, 120]} /><shadowMaterial transparent opacity={.18} depthWrite={false} />
    </mesh>}
  </>;
}
