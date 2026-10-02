import { runInertiaAnimation, type InertiaSecuringProfile } from './engine/inertiaSimulation';
import { runStaticInspection, type InspectionKind, type InspectionResponse } from './manualInspection';
import type { PhysicsTarget } from './physicsTarget';

const send = (message: InspectionResponse) => self.postMessage(message);
self.onmessage = async (event: MessageEvent<{ target: PhysicsTarget; kind: InspectionKind; securing?: InertiaSecuringProfile; securingLabel: string }>) => {
  const { target, kind, securing, securingLabel } = event.data;
  try {
    send({ progress: 0 });
    if (kind !== 'inertia') { send({ progress: 100, result: runStaticInspection(target, kind) }); return; }
    // Reject invalid geometry/numbers before passing data to the existing physics engine.
    const geometry = runStaticInspection(target, 'geometry');
    if (geometry.attention) throw new Error('경계·충돌 문제가 있습니다. 배치를 수정한 뒤 관성 테스트를 실행하세요.');
    const details: string[] = [];
    const scenarios = ['acceleration', 'braking', 'cornering'] as const;
    const labels = ['출발 0.30g', '급제동 0.50g', '급회전 0.35g'];
    for (let i = 0; i < scenarios.length; i++) {
      const r = await runInertiaAnimation(target.container, target.result.placements, scenarios[i], target.supports ?? [],
        p => send({ progress: Math.min(99, Math.round((i + p) / scenarios.length * 100)) }), securing, { captureFrames: false });
      details.push(`${labels[i]} · ${r.simulatedSeconds.toFixed(1)}초 · 최대 수평 이동 ${(r.maxHorizontalShiftM * 1000).toFixed(1)} mm · 최대 기울기 ${r.maxTiltDeg.toFixed(1)}°`);
    }
    send({ progress: 100, result: { summary: '관성 시나리오 3종 계산 완료', details,
      caution: `${securingLabel}. 기존 Rapier 강체·마찰·결속 모델의 계산값입니다. 실측 도로·포장 변형·고박 시공 상태를 보증하지 않으며 실제 운송 안전 인증이 아닙니다.`, attention: false } });
  } catch (error) { send({ progress: 0, error: error instanceof Error ? error.message : '점검 계산을 완료하지 못했습니다.' }); }
};
