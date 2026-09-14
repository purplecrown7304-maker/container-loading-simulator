import './operation-progress.css';

type Props = {
  title: string;
  progress: number;
  stage: string;
  startedAt: number;
  processed?: number;
  total?: number;
  unitLabel?: string;
};

function remainingText(progress: number, startedAt: number) {
  if (!(startedAt > 0) || progress <= 0.01 || progress >= 1) return progress >= 1 ? '마무리 중' : '예상 남은 시간 계산 중';
  const elapsedSeconds = Math.max(0.1, (Date.now() - startedAt) / 1000);
  const remainingSeconds = elapsedSeconds * (1 - progress) / progress;
  if (!Number.isFinite(remainingSeconds)) return '예상 남은 시간 계산 중';
  if (remainingSeconds < 60) return `예상 남은 시간 약 ${Math.max(1, Math.ceil(remainingSeconds))}초`;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.ceil(remainingSeconds % 60);
  return `예상 남은 시간 약 ${minutes}분 ${seconds}초`;
}

export default function OperationProgressOverlay({ title, progress, stage, startedAt, processed, total, unitLabel = '개' }: Props) {
  const normalized = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const percent = Math.round(normalized * 100);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalized);
  const hasCount = Number.isFinite(processed) && Number.isFinite(total) && (total ?? 0) > 0;

  return <div className="operation-progress-backdrop" role="status" aria-live="polite" aria-label={`${title} ${percent}%`}>
    <section className="operation-progress-card">
      <div className="operation-progress-ring" aria-hidden="true">
        <svg viewBox="0 0 140 140">
          <circle className="operation-progress-track" cx="70" cy="70" r={radius} />
          <circle className="operation-progress-value" cx="70" cy="70" r={radius} strokeDasharray={circumference} strokeDashoffset={dashOffset} />
        </svg>
        <strong>{percent}%</strong>
      </div>
      <h2>{title}</h2>
      {hasCount && <p className="operation-progress-count"><b>{Math.max(0, Math.round(processed ?? 0)).toLocaleString()}</b> / {Math.max(0, Math.round(total ?? 0)).toLocaleString()}{unitLabel} 처리 완료</p>}
      <p className="operation-progress-eta">{remainingText(normalized, startedAt)}</p>
      <div className="operation-progress-stage"><span className="operation-progress-pulse" />{stage}</div>
      <small>표시된 진행률은 실제 계산 완료 구간을 기준으로 갱신됩니다.</small>
    </section>
  </div>;
}
