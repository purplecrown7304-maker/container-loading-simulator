import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { registerViewerSnapshot } from './viewerSnapshot';

/** Mounted inside the viewer Canvas; see viewerSnapshot.ts for why a frame is rendered first. */
export default function ThreeViewerSnapshot() {
  const three = useThree();
  const gl = three?.gl;
  const advance = three?.advance;
  useEffect(() => {
    const canvas = gl?.domElement;
    if (!canvas || typeof advance !== 'function' || typeof canvas.toBlob !== 'function') return undefined;
    return registerViewerSnapshot(() => {
      advance(performance.now());
      return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    });
  }, [gl, advance]);
  return null;
}
