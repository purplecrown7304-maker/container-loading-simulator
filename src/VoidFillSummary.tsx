import { uiText, useUiLanguage } from './uiLanguage';
import type { LoadingResult } from './engine/types';
import { VOID_FILL_DISCLAIMER, voidFillRows, voidFillTotal } from './voidFillPresentation';

export default function VoidFillSummary({ result, compact = false }: { result: LoadingResult; compact?: boolean }) {
  useUiLanguage();
  const rows = voidFillRows(result);
  if (!rows.length) return null;
  const total = voidFillTotal(result);
  return <section className={`void-fill-summary ${compact ? 'compact' : ''}`} aria-label={uiText("메움재 계획")}>
    <header>
      <div><b>{uiText("빈 공간 메움·버팀 계획")}</b><span>{uiText("VOID_FILL_REQUIRED · 위치와 자재를 현장에서 확인하세요.")}</span></div>
      <strong>{total.quantity} EA · {total.weightKg.toFixed(2)} kg</strong>
    </header>
    <div className="void-fill-summary-grid">
      {rows.map(row => <article key={row.id} className={row.fixedSupportEligible === 'Y' ? 'resolved' : 'unresolved'}>
        <div><b>{uiText(row.gapType)}</b><span>{uiText(row.material)}</span></div>
        <strong>{row.quantity} EA · {row.weightKg.toFixed(2)} kg</strong>
        <small>{uiText("위치 {0}/{1}/{2}m · 크기 {3}/{4}/{5}m", [row.xM, row.yM, row.zM, row.lengthM, row.widthM, row.heightM])}</small>
        <em>{row.fixedSupportEligible === 'Y' ? uiText("계획 적용 범위") : uiText("적용 범위 밖 · 자재 미확정")}</em>
      </article>)}
    </div>
    <p>{uiText(VOID_FILL_DISCLAIMER)}</p>
  </section>;
}
