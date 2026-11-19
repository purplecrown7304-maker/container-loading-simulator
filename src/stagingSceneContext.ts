import { createContext, useContext } from 'react';
import type { Placement } from './engine/types';
import type { StagingInventory } from './stagingInventory';
import type { StagingYardLayout } from './stagingYardLayout';
import type { StagingYardDrag } from './ThreeStagingYard';
import type { StagingFlightSequence } from './stagingFlights';

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
  /** `cautions` belong to an accepted candidate: errors it would leave on the plan without being refused. */
  preview: { unitId: string; candidate: Placement; valid: boolean; reasons: string[]; cautions?: string[] } | null;
  /** Transient display poses; never serialized or passed to loading/physics. */
  flight?: StagingFlightSequence | null;
  completeFlight?: (id: number) => void;
  /** The operator's motion checkbox and the system reduced-motion setting, combined. */
  motionEnabled?: boolean;
  selectUnit: (id: string | null) => void;
  selectVehicleUnit: (kind: 'cargo' | 'support', index: number) => void;
  /** Read-only whole-pallet contents/miniature, independent of placement selection. */
  inspectUnit?: (id: string) => void;
  inspectVehicleUnit?: (kind: 'cargo' | 'support', index: number) => void;
  /** False while input, packaging, calculation or playback prevents manual edits. */
  canManipulate?: boolean;
  setView: (view: StagingCameraView) => void;
  onDragStart: (drag: StagingYardDrag) => void;
  onDragMove: (drag: StagingYardDrag) => void;
  onDragEnd: (drag: StagingYardDrag) => void;
  onDraggingChange: (dragging: boolean) => void;
};

export const StagingSceneContext = createContext<StagingSceneBridge | null>(null);
export const useStagingScene = () => useContext(StagingSceneContext);
