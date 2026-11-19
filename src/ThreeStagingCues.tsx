import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { StagingBounds } from './stagingYardLayout';
import type { StagingCursor } from './stagingDragCues';

/** Slightly larger than the cargo so the line is not hidden in the cargo's own edge. */
const OUTLINE_PAD_M = .04;

/** Box outlines drawn over cargo in the scene. Display only: never picked and never part
 * of a plan. One geometry and one material serve every outline of a set. */
export function createStagingOutlineResources(name: string, color: string, renderOrder: number) {
  const box = new THREE.BoxGeometry(1, 1, 1), edges = new THREE.EdgesGeometry(box); box.dispose();
  const material = new THREE.LineBasicMaterial({ color, depthTest: false });
  const root = new THREE.Group(); root.name = name; root.userData = { displayOnly: true, outlines: 0 };
  const lines: THREE.LineSegments[] = [];
  return {
    root,
    update(boxes: readonly StagingBounds[]) {
      while (lines.length < boxes.length) {
        const line = new THREE.LineSegments(edges, material);
        line.name = `${name} ${lines.length + 1}`; line.renderOrder = renderOrder; line.raycast = () => {};
        lines.push(line); root.add(line);
      }
      lines.forEach((line, index) => {
        const bounds = boxes[index];
        line.visible = Boolean(bounds);
        if (!bounds) return;
        line.position.set((bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2);
        line.scale.set(bounds.max[0] - bounds.min[0] + OUTLINE_PAD_M, bounds.max[1] - bounds.min[1] + OUTLINE_PAD_M, bounds.max[2] - bounds.min[2] + OUTLINE_PAD_M);
      });
      root.userData.outlines = boxes.length;
    },
    /** Frees the GPU side only, so a re-mounted owner can keep drawing with it. */
    dispose() { edges.dispose(); material.dispose(); },
  };
}

export function ThreeStagingOutlines({ boxes, name, color, renderOrder }: { boxes: readonly StagingBounds[]; name: string; color: string; renderOrder: number }) {
  const { invalidate } = useThree();
  const resources = useMemo(() => createStagingOutlineResources(name, color, renderOrder), [name, color, renderOrder]);
  useEffect(() => () => resources.dispose(), [resources]);
  useLayoutEffect(() => { resources.update(boxes); invalidate(); }, [resources, boxes, invalidate]);
  return <primitive object={resources.root} dispose={null} />;
}

/** The canvas cursor follows what the pointer can do with the cargo under it. It is set
 * on the canvas only and handed back when the staging view goes away. */
export function ThreeStagingCursor({ cursor }: { cursor: StagingCursor }) {
  const { gl } = useThree();
  useLayoutEffect(() => {
    const element = gl.domElement;
    element.style.cursor = cursor;
    return () => { element.style.cursor = ''; };
  }, [gl, cursor]);
  return null;
}
