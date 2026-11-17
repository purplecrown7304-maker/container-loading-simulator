import type { ReactNode } from 'react';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import type { PalletSnapshot } from './palletSnapshotStore';
import type { StagingMode } from './stagingInventory';
import type { LoadingViewerProps } from './LoadingViewer';

export type StagingApplication = {
  inputKey: string;
  result: LoadingResult;
  palletSnapshot?: PalletSnapshot;
  scene?: Pick<LoadingViewerProps, 'result' | 'supports'>;
  /** The panel validates/adopts its canonical pallet plan synchronously. */
  adoptPallet?: () => boolean;
};
export type StagingWorkspaceProps = {
  container: ContainerSpec;
  cargo: CargoItem[];
  preparedCargo?: CargoItem[];
  /** Selected products with no established package count are never fabricated as boxes. */
  pendingProducts?: number;
  inputsConfirmed?: boolean;
  mode: StagingMode;
  inputKey: string;
  result: LoadingResult;
  isPreview: boolean;
  calculating: boolean;
  onApply: (application: StagingApplication) => boolean;
  children: ReactNode;
};
