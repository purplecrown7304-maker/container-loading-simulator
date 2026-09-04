import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { physicsTargetFromPalletSnapshot } from './certifiedExport';
import type { CargoItem, ContainerSpec, LoadingResult } from './engine/types';
import { hasCurrentPhysicsVerification } from './exportVerification';
import {
  buildSecuringUsage,
  createPhysicsTargetSignature,
  readLatestInertiaCertification,
  type InertiaCertification,
} from './inertiaCertification';
import { OPEN_INERTIA_TEST_EVENT } from './inertiaTestEvents';
import { assessWorkOrderCertification } from './inertiaWorkOrderPolicy';
import { buildPalletLoadingReportHtml, type PalletWorkSnapshot } from './palletWorkerReportV2';
import { readPhysicsTarget } from './physicsTarget';
import { buildLoadingReportHtml } from './report';
import { openWorkspace } from './uiEvents';
import { boxWorkOrderHardBlockers, palletWorkOrderHardBlockers } from './workOrderAccessPolicy';

const OPEN_PHYSICS_VALIDATION_EVENT = 'container-loading:open-physics-validation';

type LoadingDetail = { container: ContainerSpec; cargo: CargoItem[]; result: LoadingResult };
type DashboardWindow = Window & {
  __containerLoadingLatestResult?: LoadingDetail;
  __containerLoadingPalletSnapshot?: PalletWorkSnapshot;
};

function buttonText(button: HTMLButtonElement) {
  return (button.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function patchCargoUi() {
  document.querySelectorAll<HTMLElement>('.onboarding-banner').forEach(node => {
    node.style.display = 'none';
  });

  document.querySelectorAll<HTMLParagraphElement>('.status-message').forEach(node => {
    const initialGuide = (node.textContent ?? '').includes('처음 시작합니다.');
    node.style.display = initialGuide ? 'none' : '';
  });

  document.querySelectorAll<HTMLDetailsElement>('.cargo-add-panel').forEach(panel => {
    const summary = panel.querySelector<HTMLElement>('summary');
    if (panel.open) {
      panel.style.display = '';
      if (summary) summary.style.display = 'none';
    } else {
      panel.style.display = 'none';
    }
  });

  // 이전 구현은 화면의 모든 '샘플 복원' 버튼마다 새 '박스 선택' 버튼을 삽입해
  // 빈 화물 카드에 버튼이 중복됐다. 이제 기존 빈 상태 버튼 하나만 재사용한다.
  const empty = document.querySelector<HTMLElement>('.cargo-browser .empty-cargo');
  if (empty) {
    const title = empty.querySelector<HTMLElement>('b');
    const guide = empty.querySelector<HTMLElement>('span');
    if (title && title.textContent !== '등록된 화물이 없습니다.') title.textContent = '등록된 화물이 없습니다.';
    const guideText = '박스 선택을 눌러 등록된 박스 목록에서 적재할 화물을 고르세요.';
    if (guide && guide.textContent !== guideText) guide.textContent = guideText;

    const buttons = [...empty.querySelectorAll<HTMLButtonElement>('button')];
    buttons.forEach((button, index) => {
      if (index === 0) {
        if (button.textContent !== '박스 선택') button.textContent = '박스 선택';
        button.dataset.singleBoxSelector = 'true';
        button.style.display = '';
      } else {
        button.style.display = 'none';
      }
    });
  }

  // 빠른 작업의 옛 샘플 복원/대체 박스선택은 제거한다.
  document.querySelectorAll<HTMLButtonElement>('.quick-card button').forEach(button => {
    const text = buttonText(button);
    if (text === '샘플 복원' || button.classList.contains('box-select-replacement')) button.style.display = 'none';
  });
}

function currentMode(): 'boxes' | 'pallets' {
  const active = document.querySelector<HTMLButtonElement>('.mode-tabs button.active');
  return (active?.textContent ?? '').includes('팔레트') ? 'pallets' : 'boxes';
}

function openPopupHtml(html: string) {
  const popup = window.open('', '_blank');
  if (!popup) {
    window.alert('브라우저 팝업이 차단되어 작업지시서를 열지 못했습니다. 팝업을 허용한 뒤 다시 실행하세요.');
    return;
  }
  try { popup.opener = null; } catch { /* opener 변경 제한 브라우저 */ }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function advisoryBanner(html: string, text: string) {
  const safe = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return html.replace(
    '<body>',
    `<body><div style="margin:8px auto;max-width:794px;padding:9px 12px;border:2px solid #d97706;border-radius:8px;background:#fff7ed;color:#92400e;font:700 11px/1.45 Arial,'Noto Sans KR',sans-serif">검토용 작업지시서 · ${safe}</div>`,
  );
}

function confirmAdvisory(reason: string) {
  return window.confirm(`현재 적재안은 작업지시서 생성에 필요한 물리 배치 조건은 충족합니다.\n\n${reason}\n\n검증 경고를 포함한 '검토용 작업지시서'를 생성할까요?`);
}

function boxAdvisoryReason() {
  if (hasCurrentPhysicsVerification()) return '';
  const target = readPhysicsTarget();
  const certification = readLatestInertiaCertification();
  const matches = Boolean(target && certification && certification.targetSignature === createPhysicsTargetSignature(target) && certification.mode === 'boxes');
  if (!matches || !certification) return '관성 3종 검증이 미완료이거나 현재 적재안과 일치하지 않습니다. 출고 전 현장 확인이 필요합니다.';
  const level = assessWorkOrderCertification(certification);
  if (level === 'danger') return '관성 시뮬레이션에서 위험 기준을 초과했습니다. 문서는 검토용으로만 사용하고 재배치·고정 보강 후 출고 여부를 결정하세요.';
  if (level === 'caution') return '관성 내부 PASS 기준을 일부 초과했습니다. 작업지시서의 보완 권장사항과 현장 고정을 확인하세요.';
  return '관성 검증이 완전히 끝나지 않았습니다. 출고 전 현장 확인이 필요합니다.';
}

function openBoxWorkOrder(detail: LoadingDetail) {
  const blockers = boxWorkOrderHardBlockers(detail.container, detail.result);
  if (blockers.length) {
    window.alert(`작업지시서 생성 차단 · 실제 적재가 불가능한 항목이 있습니다.\n\n${blockers.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
    return;
  }

  const reason = boxAdvisoryReason();
  if (reason && !confirmAdvisory(reason)) return;
  const html = buildLoadingReportHtml(detail.container, detail.cargo, detail.result);
  openPopupHtml(reason ? advisoryBanner(html, reason) : html);
}

function advisoryPalletCertification(
  container: ContainerSpec,
  cargo: CargoItem[],
  snapshot: PalletWorkSnapshot,
): InertiaCertification {
  const target = physicsTargetFromPalletSnapshot(container, cargo, snapshot);
  const signature = createPhysicsTargetSignature(target);
  const latest = readLatestInertiaCertification();
  if (latest?.mode === 'pallets' && latest.targetSignature === signature) return latest;

  const securing = buildSecuringUsage(target, 1);
  return {
    status: 'failed',
    mode: 'pallets',
    targetSignature: signature,
    testedAt: new Date().toISOString(),
    securing,
    testedScenarios: 0,
    passedScenarios: 0,
    failedScenarios: ['acceleration', 'braking', 'cornering'],
    maxHorizontalShiftM: 0,
    maxTiltDeg: 0,
    maxCargoRelativeSlipM: 0,
    maxSupportShiftM: 0,
    results: {},
    payloadWithinLimit: target.result.loadedWeightKg + securing.estimatedAddedWeightKg <= container.maxPayloadKg + 1e-9,
    attempts: [],
  };
}

function openPalletWorkOrder(detail: LoadingDetail, snapshot: PalletWorkSnapshot | undefined) {
  if (!snapshot) {
    window.alert('팔레트 작업지시서를 만들 적재 결과가 없습니다. 팔레트 자동 적재를 먼저 실행하세요.');
    return;
  }

  const blockers = palletWorkOrderHardBlockers(detail.container, snapshot);
  if (blockers.length) {
    window.alert(`작업지시서 생성 차단 · 실제 팔레트 적재가 불가능한 항목이 있습니다.\n\n${blockers.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
    return;
  }

  const certification = advisoryPalletCertification(detail.container, detail.cargo, snapshot);
  if (!certification.payloadWithinLimit) {
    window.alert('작업지시서 생성 차단 · 기본 고정 보조자재 중량까지 포함하면 컨테이너 최대 적재중량을 초과합니다.');
    return;
  }

  const level = assessWorkOrderCertification(certification);
  const reason = level === 'pass'
    ? ''
    : level === 'caution'
      ? '관성 내부 PASS 기준을 일부 초과했습니다. 작업지시서의 고정 보완사항을 현장에서 확인하세요.'
      : level === 'danger'
        ? '관성 시뮬레이션에서 위험 기준을 초과했습니다. 문서는 검토용으로만 사용하고 팔레트 재배치·밴딩·랩핑·고정 보강 후 출고 여부를 결정하세요.'
        : '관성 3종 검증이 미완료이거나 현재 팔레트 적재안과 일치하지 않습니다. 출고 전 현장 확인이 필요합니다.';
  if (reason && !confirmAdvisory(reason)) return;

  const html = buildPalletLoadingReportHtml(detail.container, detail.cargo, snapshot, certification);
  openPopupHtml(reason ? advisoryBanner(html, reason) : html);
}

export default function DashboardCommandDock() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const dockHost = document.createElement('div');
    dockHost.className = 'dashboard-test-dock-host';

    const placeDock = () => {
      const sidebar = document.querySelector<HTMLElement>('.dashboard-right');
      const summary = document.querySelector<HTMLElement>('.operational-right-summary');
      if (!sidebar) return;
      if (summary?.parentElement === sidebar) {
        if (summary.nextElementSibling !== dockHost) summary.insertAdjacentElement('afterend', dockHost);
      } else if (!dockHost.isConnected) {
        sidebar.appendChild(dockHost);
      }
      setHost(current => current ?? dockHost);
      patchCargoUi();
    };

    const onClickCapture = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
      if (!button) return;

      if (button.dataset.singleBoxSelector === 'true') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openWorkspace('boxes');
        return;
      }

      const text = buttonText(button);
      if (text !== '작업지시서' && text !== '작업 지시서') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const dashboard = window as DashboardWindow;
      const detail = dashboard.__containerLoadingLatestResult;
      if (!detail) {
        window.alert('작업지시서를 만들 적재 결과가 없습니다. 자동 적재를 먼저 실행하세요.');
        return;
      }

      if (currentMode() === 'pallets') openPalletWorkOrder(detail, dashboard.__containerLoadingPalletSnapshot);
      else openBoxWorkOrder(detail);
    };

    placeDock();
    const observer = new MutationObserver(placeDock);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.addEventListener('click', onClickCapture, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClickCapture, true);
      dockHost.remove();
    };
  }, []);

  if (!host) return null;

  return createPortal(
    <section className="dashboard-card dashboard-test-dock" aria-label="테스트 도구">
      <h2>테스트 도구</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          className="result-open-action"
          onClick={() => window.dispatchEvent(new Event(OPEN_PHYSICS_VALIDATION_EVENT))}
        >
          물리 안정성 종합검증
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => window.dispatchEvent(new Event(OPEN_INERTIA_TEST_EVENT))}
        >
          관성 테스트
        </button>
      </div>
    </section>,
    host,
  );
}
