import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ContainerSpec } from './engine/types';
import type { StagingInventory } from './stagingInventory';
import { buildStagingYardLayout, type StagingYardLayout } from './stagingYardLayout';
import { buildStagingFlights, type StagingFlightSequence } from './stagingFlights';
import type { VehicleRigKind } from './threeVehicleLayout';

export type StagingFlightOrigin = { inventory: StagingInventory; layout: StagingYardLayout; planKey: string };
type Options = StagingFlightOrigin & { epoch: string; container: ContainerSpec; vehicleRig: VehicleRigKind;
  calculating: boolean; confirmed: boolean; isPreview: boolean };

/** Display state only: accepted plans, storage and certification are never replayed. */
export function useStagingFlights(options: Options) {
  const [enabled, setEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [active, setActive] = useState<{ epoch: string; sequence: StagingFlightSequence } | null>(null);
  const pending = useRef<{ epoch: string; source: StagingFlightOrigin; automatic: boolean } | null>(null);
  const stable = useRef<{ epoch: string; source: StagingFlightOrigin } | null>(null);
  const previous = useRef({ epoch: options.epoch, calculating: false });
  const nextId = useRef(0), current = useRef(options); current.current = options;
  const allowed = useRef(enabled && !reducedMotion); allowed.current = enabled && !reducedMotion;
  const cancel = useCallback(() => { pending.current = null; setActive(null); }, []);
  const queueLoad = useCallback((source: StagingFlightOrigin) => {
    pending.current = allowed.current ? { epoch: current.current.epoch, source, automatic: false } : null;
    setActive(null);
  }, []);
  const complete = useCallback((id: number) => setActive(value => value?.sequence.id === id ? null : value), []);
  const changeEnabled = useCallback((value: boolean) => { if (!value) cancel(); setEnabled(value); }, [cancel]);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReducedMotion(preference.matches); if (preference.matches) cancel(); };
    change(); preference.addEventListener?.('change', change);
    return () => preference.removeEventListener?.('change', change);
  }, [cancel]);
  useLayoutEffect(() => {
    const { epoch, inventory, layout, planKey, calculating, confirmed, isPreview } = options;
    const source = { inventory, layout, planKey };
    const changedJob = previous.current.epoch !== epoch;
    if (changedJob || !enabled || reducedMotion) { pending.current = null; setActive(null); }
    if (calculating && !previous.current.calculating && enabled && !reducedMotion) {
      // Retain the complete pre-run yard while the existing worker owns loading.
      pending.current = { epoch, source: stable.current?.epoch === epoch ? stable.current.source : source, automatic: true };
      setActive(null);
    }
    const origin = pending.current;
    if (!calculating && origin?.epoch === epoch) {
      if (confirmed && !isPreview && !inventory.referenceResult && planKey && planKey !== origin.source.planKey) {
        const fallback = buildStagingYardLayout([...inventory.yardUnits, ...inventory.vehicleUnits], {
          container: options.container, vehicleRig: options.vehicleRig, previous: origin.source.layout,
          frame: origin.source.layout.frame, settings: origin.source.layout.settings,
        });
        const flights = buildStagingFlights(origin.source.inventory, origin.source.layout, inventory, options.container, fallback);
        pending.current = null;
        setActive(flights.length ? { epoch, sequence: { id: ++nextId.current,
          inputSignature: inventory.inputSignature, planKey, flights } } : null);
      } else if (origin.automatic && previous.current.calculating) pending.current = null;
    }
    if (!calculating) stable.current = { epoch, source };
    previous.current = { epoch, calculating };
  }, [options.epoch, options.inventory, options.layout, options.planKey, options.calculating,
    options.confirmed, options.isPreview, options.container, options.vehicleRig, enabled, reducedMotion]);
  const sequence = active?.epoch === options.epoch && active.sequence.planKey === options.planKey
    && active.sequence.inputSignature === options.inventory.inputSignature && !options.calculating
    && enabled && !reducedMotion ? active.sequence : null;
  return { sequence, enabled, reducedMotion, setEnabled: changeEnabled, queueLoad, cancel, complete };
}
