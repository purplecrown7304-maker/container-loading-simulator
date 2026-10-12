import { memo } from 'react';
import { Html, Line } from '@react-three/drei';
import { uiText, useUiLanguage } from './uiLanguage';
import { clearanceFaceLabel, clearanceNumber, type CargoClearance, type ClearanceAxis } from './cargoClearance';
import type { ThreeComparisonPlan } from './threeComparisonSceneState';

/** Annotations never receive pointer events or participate in cargo picking. */
export default memo(function ThreeClearanceGuides({ plan, clearance, axis }: { plan: ThreeComparisonPlan; clearance: CargoClearance | null; axis: ClearanceAxis }) {
  useUiLanguage();
  const { length, height } = plan.container;
  return <group>
    {plan.rearAccess && <Html position={[length / 2, height + .14, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
      <span className="three-rear-label" data-rear-access={plan.rearAccess}>{uiText(plan.rearAccess === 'door' ? '문' : '후면 기준')} ↓</span>
    </Html>}
    {clearance?.measurements.filter(value => value.axis === axis).map(value => {
      const overflow = value.distanceM < 0;
      const midpoint = value.from.map((n, i) => (n + value.to[i]) / 2) as [number, number, number];
      return <group key={value.face}>
        <Line points={[value.from, value.to]} raycast={() => {}} color={overflow ? '#dc2626' : '#0369a1'} lineWidth={2} dashed dashSize={.06} gapSize={.04} depthTest={false} renderOrder={1100}/>
        <Html position={midpoint} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
          <span className="three-clearance-label" data-overflow={overflow}>{uiText(clearanceFaceLabel(value.face, plan.rearAccess))} {clearanceNumber(value.distanceM)}{overflow ? ` · ${uiText('경계 초과')}` : ''}</span>
        </Html>
      </group>;
    })}
  </group>;
});
