import { useEffect, useRef } from 'react';
import { requestExactCertification } from './autoCertification';
import { containerInputError, preflightCargoInput } from './engine/inputPreflight';
import { LOADING_STRATEGY_STORAGE_KEY, type LoadingStrategy } from './engine/loadingEngine';
import { loadingStrategyDefinition, normalizeLoadingStrategy } from './engine/loadingStrategies';
import { optimizeLoadingWithPhysics } from './engine/physicsOptimizer';
import { clearFinalLayout } from './finalLayout';
import { loadingExecutionEngine } from './loadingExecution';
import { clearLoadingWorkflowProgress, publishLoadingWorkflowProgress, type LoadingMode } from './loadingWorkflow';
import { readStoredState } from './storage';
import { APP_ACTION_EVENT, type AppActionDetail } from './uiEvents';

export const REQUEST_VERIFIED_LOADING_EVENT = 'container-loading:request-verified-loading';

export type VerifiedLoadingRequest = {
  mode: LoadingMode;
  strategy: LoadingStrategy;
};

export function requestVerifiedLoading(detail: VerifiedLoadingRequest) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<VerifiedLoadingRequest>(REQUEST_VERIFIED_LOADING_EVENT, { detail }));
}

export default function LoadingRunOrchestrator() {
  const runId = useRef(0);

  useEffect(() => {
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<VerifiedLoadingRequest>).detail;
      if (!detail) return;
      const id = ++runId.current;
      const cancelled = () => id !== runId.current;
      const strategy = normalizeLoadingStrategy(detail.strategy);
      const mode = detail.mode;
      const strategyMeta = loadingStrategyDefinition(strategy);

      window.localStorage.setItem(LOADING_STRATEGY_STORAGE_KEY, strategy);
      clearFinalLayout();
      clearLoadingWorkflowProgress();
      publishLoadingWorkflowProgress({
        mode,
        strategy,
        phase: 'candidate-generation',
        percent: 5,
        title: '자동 적재 후보 생성',
        detail: `${mode === 'boxes' ? 'BOX' : 'PALLET'} · ${strategyMeta.label}`,
      });

      // PALLET keeps its existing production optimizer and certification bridge. The UI
      // mode switch is performed before this request, so this dispatch reaches the real
      // pallet branch instead of synthesizing a second pallet engine.
      if (loadingExecutionEngine(mode) === 'pallet-optimizer') {
        window.dispatchEvent(new CustomEvent<AppActionDetail>(APP_ACTION_EVENT, { detail: { action: 'run-loading' } }));
        return;
      }

      const stored = readStoredState();
      if (!stored) {
        publishLoadingWorkflowProgress({ mode, strategy, phase: 'failed', percent: 100, title: '자동 적재 중단', detail: '저장된 포장 화물이 없습니다.' });
        return;
      }
      const invalidContainer = containerInputError(stored.container);
      if (invalidContainer) {
        publishLoadingWorkflowProgress({ mode, strategy, phase: 'failed', percent: 100, title: '자동 적재 중단', detail: invalidContainer });
        return;
      }
      const preflight = preflightCargoInput(stored.cargo);
      if (preflight.rejected.length) {
        publishLoadingWorkflowProgress({ mode, strategy, phase: 'failed', percent: 100, title: '자동 적재 중단', detail: `${preflight.rejected[0].cargoId}: ${preflight.rejected[0].reason}` });
        return;
      }
      const cargo = preflight.cargo.filter((item) => item.quantity > 0);
      if (!cargo.length) {
        publishLoadingWorkflowProgress({ mode, strategy, phase: 'failed', percent: 100, title: '자동 적재 중단', detail: '적재할 화물이 없습니다.' });
        return;
      }

      void optimizeLoadingWithPhysics(
        stored.container,
        cargo,
        progress => {
          if (cancelled()) return;
          const phase = progress.physicsProgress <= 0.01 ? 'candidate-generation' : 'physics-validation';
          const percent = phase === 'candidate-generation'
            ? 10
            : 20 + Math.round(progress.physicsProgress * 28);
          publishLoadingWorkflowProgress({
            mode,
            strategy,
            phase,
            percent,
            title: phase === 'candidate-generation' ? '하이브리드 후보 생성' : 'Rapier 물리 검증',
            detail: `StrictWall + EMS Beam V2 · ${strategyMeta.label} · ${Math.round(progress.physicsProgress * 100)}%`,
          });
        },
        strategy,
      ).then(optimized => {
        if (cancelled()) return;
        publishLoadingWorkflowProgress({
          mode,
          strategy,
          phase: 'static-validation',
          percent: 50,
          title: '정적 안전 게이트 확인',
          detail: `후보 ${optimized.result.placements.length}EA · 경계/충돌/중량 하드 게이트 확인`,
        });
        (window as Window & { __containerLoadingLatestPhysics?: unknown }).__containerLoadingLatestPhysics = optimized.physics;
        window.dispatchEvent(new CustomEvent('container-loading:physics-validation-result', {
          detail: { mode: 'boxes', result: optimized.physics, preferredStrategy: strategy },
        }));
        publishLoadingWorkflowProgress({
          mode,
          strategy,
          phase: 'physics-validation',
          percent: 55,
          title: 'Rapier 물리 검증 완료',
          detail: `물리 안정성 ${optimized.physics.score}점 · 최종 재검증으로 이동`,
        });
        // Working candidate is deliberately NOT published as finalLayout or loading result.
        // autoCertification re-runs physics, then DirectWorkOrderOptimizer runs inertia and
        // publishes finalLayout only after an approved candidate passes/caution policy.
        requestExactCertification({ mode: 'boxes', container: stored.container, cargo, result: optimized.result });
      }).catch(error => {
        if (cancelled()) return;
        console.error('Verified loading orchestration failed', error);
        publishLoadingWorkflowProgress({
          mode,
          strategy,
          phase: 'failed',
          percent: 100,
          title: '자동 적재 검증 실패',
          detail: '기존 최종 배치는 유지했습니다. 실패 후보를 finalLayout으로 확정하지 않았습니다.',
        });
      });
    };

    window.addEventListener(REQUEST_VERIFIED_LOADING_EVENT, onRequest);
    return () => {
      runId.current += 1;
      window.removeEventListener(REQUEST_VERIFIED_LOADING_EVENT, onRequest);
    };
  }, []);

  return null;
}
