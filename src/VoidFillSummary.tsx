import type { LoadingResult } from './engine/types';
import { VOID_FILL_DISCLAIMER, voidFillRows, voidFillTotal } from './voidFillPresentation';

export default function VoidFillSummary({ result, compact = false }: { result: LoadingResult; compact?: boolean }) {
  const rows = voidFillRows(result);
  if (!rows.length) return null;
  const total = voidFillTotal(result);
  return <section className={`void-fill-summary ${compact ? 'compact' : ''}`} aria-label="메움재 계획">
    <header>
      <div><b>빈 공간 메움·버팀 계획</b><span>VOID_FILL_REQUIRED · 위치와 자재를 현장에서 확인하세요.</span></div>
      <strong>{total.quantity} EA · {total.weightKg.toFixed(2)} kg</strong>
    </header>
    <div className="void-fill-summary-grid">
      {rows.map(row => <article key={row.id} className={row.fixedSupportEligible === 'Y' ? 'resolved' : 'unresolved'}>
        <div><b>{row.gapType}</b><span>{row.material}</span></div>
        <strong>{row.quantity} EA · {row.weightKg.toFixed(2)} kg</strong>
        <small>위치 {row.xM}/{row.yM}/{row.zM}m · 크기 {row.lengthM}/{row.widthM}/{row.heightM}m</small>
        <em>{row.fixedSupportEligible === 'Y' ? '계획 적용 범위' : '적용 범위 밖 · 자재 미확정'}</em>
      </article>)}
    </div>
    <p>{VOID_FILL_DISCLAIMER}</p>
  </section>;
}
