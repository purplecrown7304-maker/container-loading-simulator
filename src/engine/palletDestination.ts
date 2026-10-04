import type { ContainerSpec } from './types';

export function palletDestinationFit(container: ContainerSpec, pallet: { length: number; width: number; material?: string }) {
  const destination = container.palletDestination;
  const size = [Math.round(pallet.length * 1000), Math.round(pallet.width * 1000)].sort((a,b) => a-b).join('x');
  const required = destination?.requiredSize.split('x').map(Number).sort((a,b) => a-b).join('x');
  if (destination?.requiredSize && size !== required) return { status: 'incompatible' as const, label: '수령처 지정 규격 불일치' };
  if (destination?.transport === 'export') {
    // The catalog contains dimensions, not certificates or consignee acceptance.
    return { status: 'check' as const, label: pallet.material === 'wood' ? '목재 처리·표시 / 수령처 확인' : '도착 지역·수령처 확인' };
  }
  return { status: 'fit' as const, label: destination?.requiredSize ? '지정 규격 일치' : '별도 지정 없음' };
}
