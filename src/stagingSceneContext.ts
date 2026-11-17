import { createContext, useContext } from 'react';
import type { Placement } from './engine/types';
import type { StagingInventory } from './stagingInventory';
import type { StagingYardLayout } from './stagingYardLayout';
import type { StagingYardDrag } from './ThreeStagingYard';

export type StagingCameraView = 'all' | 'vehicle' | 'yard';
export type StagingSceneBridge = {
  inventory: StagingInventory;
  layout: StagingYardLayout;
  visibleZoneIds: readonly string[];
  selectedUnitId: string | null;
  view: StagingCameraView;
  /** Changes only for an explicit view/zone action, never an inventory refresh. */
  viewRequest: number;
  dragging: boolean;
  preview: { unitId: string; candidate: Placement; valid: boolean; reasons: string[] } | null;
  selectUnit: (id: string | null) => void;
  selectVehicleUnit: (kind: 'cargo' | 'support', index: number) => void;
  setView: (view: StagingCameraView) => void;
  onDragStart: (drag: StagingYardDrag) => void;
  onDragMove: (drag: StagingYardDrag) => void;
  onDragEnd: (drag: StagingYardDrag) => void;
  onDraggingChange: (dragging: boolean) => void;
};

export const StagingSceneContext = createContext<StagingSceneBridge | null>(null);
export const useStagingScene = () => useContext(StagingSceneContext);
