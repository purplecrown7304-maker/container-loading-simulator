import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { loginMember, logoutMember, MEMBER_AUTH_EVENT, readSupabaseMember, signUpMember } from '../memberAuth';
import { companyRequest } from './api';
import './company-workspace.css';

import type { Snapshot, CompanyRole as Role, CompanySpace as Space, Plan, CompanyDetail as Detail } from './types';
type Props = { standalone?: boolean; onClose?: () => void; onCapture?: () => Snapshot; onLoad?: (snapshot: Snapshot) => void };
const roleLabel: Record<Role, string> = { owner: '소유자', admin: '관리자', planner: '계획 담당', approver: '검토 담당', viewer: '조회 담당' };
const statusLabel: Record<string, string> = { draft: '작성 중', submitted: '검토 대기', approved: '승인', changes_requested: '수정 요청' };
const actionLabel: Record<string, string> = { company_created: '기업 생성', invite_created: '초대 발급', member_joined: '직원 참여', role_changed: '역할 변경', plan_saved: '계획 저장', plan_submitted: '검토 제출', plan_approved: '업무 검토 승인', plan_changes_requested: '수정 요청' };
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '날짜 기록 없음' : parsed.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }); }

export default function CompanyWorkspace({ standalone = false, onClose, onCapture, onLoad }: Props) {
  const [member, setMember] = useState(readSupabaseMember);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [detail, setDetail] = useState<Detail>();
  const [planId, setPlanId] = useState('');
  const [plan, setPlan] = useState<Plan>();
  const [planOffset, setPlanOffset] = useState(0);
  const [planLoading, setPlanLoading] = useState(false);
  const selectedPlan = useRef(planId); selectedPlan.current = planId;
  const planRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('planner');
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string }>();
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [visibleRows, setVisibleRows] = useState(100);
  const epoch = useRef(0);
  const operation = useRef(false);
  const selectedCompany = useRef(companyId); selectedCompany.current = companyId;
  useEffect(() => { setPlanOffset(0); }, [companyId, member]);

  useEffect(() => {
    const sync = () => { epoch.current++; operation.current = false; setBusy(false); setLoading(false); setMember(readSupabaseMember()); setDetail(undefined); setSpaces([]); setCompanyId(''); setPlanId(''); setInvitation(undefined); setInviteCode(''); setInviteEmail(''); setInviteRole('planner'); setCompanyName(''); setTitle(''); setComment(''); setPassword(''); setError(''); setNotice(''); };
    window.addEventListener(MEMBER_AUTH_EVENT, sync);
    return () => { epoch.current++; window.removeEventListener(MEMBER_AUTH_EVENT, sync); };
  }, []);
  useEffect(() => {
    if (!member) return;
    let active = true; const generation = epoch.current;
    setLoading(true); setError('');
    companyRequest<{ spaces: Space[] }>('list').then(data => {
      if (active && generation === epoch.current) { setSpaces(data.spaces); setCompanyId(data.spaces[0]?.id ?? ''); }
    }).catch(reason => { if (active && generation === epoch.current) handleError(reason, '기업 목록을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [member]);
  useEffect(() => {
    setDetail(undefined); setPlanId(''); setPlan(undefined); setTitle(''); setComment(''); setInvitation(undefined); setInviteEmail('');
    if (!companyId || !member) return;
    let active = true; const generation = epoch.current;
    setLoading(true); setError('');
    companyRequest<Detail>('detail', { companyId, planOffset }).then(data => { if (active && generation === epoch.current) setDetail(data); })
      .catch(reason => { if (active && generation === epoch.current) handleError(reason, '기업 정보를 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, member, planOffset]);
  useEffect(() => {
    setPlan(undefined);
    if (!companyId || !planId || !member) { setPlanLoading(false); return; }
    const generation = epoch.current;
    void loadPlan(companyId, planId).catch(reason => {
      if (generation === epoch.current && selectedCompany.current === companyId && selectedPlan.current === planId) handleError(reason, '계획을 불러오지 못했습니다.');
    });
    return () => { planRequest.current++; };
  }, [companyId, planId, member]);
  useEffect(() => { setVisibleRows(100); }, [planId, companyId]);

  function handleError(reason: unknown, fallback: string) {
    const denied = reason as { code?: string; status?: number } | null;
    if (denied?.code === 'company_forbidden' || denied?.status === 403 || denied?.code === 'member_auth_required') {
      epoch.current++; operation.current = false; setBusy(false); setLoading(false);
      setDetail(undefined); setPlan(undefined); setPlanId(''); setCompanyId(''); setSpaces([]);
      setInvitation(undefined); setInviteCode(''); setInviteEmail(''); setTitle(''); setComment('');
    }
    setError(reason instanceof Error ? reason.message : fallback);
  }

  async function run(work: () => Promise<void>) {
    if (operation.current) return;
    const generation = epoch.current;
    operation.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (reason) { if (generation === epoch.current) handleError(reason, '요청에 실패했습니다. 다시 확인하세요.'); }
    finally { if (generation === epoch.current) { operation.current = false; setBusy(false); } }
  }
  async function scopedRequest<T>(op: string, payload?: Record<string, unknown>): Promise<T> {
    const generation = epoch.current;
    const value = await companyRequest<T>(op, payload);
    if (generation !== epoch.current) throw new Error('회원 세션이 변경되었습니다.');
    return value;
  }
  async function loadPlan(id: string, requestedPlan: string) {
    const request = ++planRequest.current, generation = epoch.current;
    setPlanLoading(true);
    try {
      const loaded = await scopedRequest<Plan>('plan', { companyId: id, planId: requestedPlan });
      if (generation === epoch.current && request === planRequest.current && selectedCompany.current === id && selectedPlan.current === requestedPlan) setPlan(loaded);
    } finally {
      if (generation === epoch.current && request === planRequest.current) setPlanLoading(false);
    }
  }
  async function refresh(id = companyId, offset = planOffset, includePlan = true) {
    const generation = epoch.current;
    const data = await scopedRequest<Detail>('detail', { companyId: id, planOffset: offset });
    if (generation === epoch.current && selectedCompany.current === id) setDetail(data);
    if (includePlan && selectedPlan.current && generation === epoch.current && selectedCompany.current === id) await loadPlan(id, selectedPlan.current);
  }
  async function joinSpace(op: 'create' | 'accept') {
    const generation = epoch.current;
    const space = await scopedRequest<Space>(op, op === 'create' ? { name: companyName.trim() } : { code: inviteCode.trim() });
    if (generation !== epoch.current) return;
    setSpaces(previous => [...previous.filter(item => item.id !== space.id), space]); setCompanyId(space.id); setCompanyName(''); setInviteCode('');
    setNotice(op === 'create' ? '기업 공간을 만들었습니다.' : '기업 공간에 참여했습니다.');
  }
  const role = detail?.space.role;
  const canManage = role === 'owner' || role === 'admin';
  const canPlan = canManage || role === 'planner';
  const canReview = canManage || role === 'approver';
  const editable = plan && ['draft', 'changes_requested'].includes(plan.status);
  const isOwnSubmission = plan?.submitted_by === member?.id;
  const snapshot = plan?.snapshot;
  const whatIf = Boolean(snapshot?.container.limitReview || snapshot?.result?.limitReview || snapshot?.recordedVerification?.status === 'review');
  const counts = useMemo(() => {
    const loaded = new Map<string, number>(), remaining = new Map<string, number>();
    for (const item of snapshot?.result?.placements ?? []) loaded.set(item.cargoId, (loaded.get(item.cargoId) ?? 0) + 1);
    for (const item of snapshot?.result?.remaining ?? []) remaining.set(item.cargoId, (remaining.get(item.cargoId) ?? 0) + item.quantity);
    const ids = new Set(snapshot?.cargo.map(item => item.id));
    const matches = Boolean(snapshot?.result && ids.size === snapshot.cargo.length
      && [...loaded.keys(), ...remaining.keys()].every(id => ids.has(id))
      && snapshot.cargo.every(item => (loaded.get(item.id) ?? 0) + (remaining.get(item.id) ?? 0) === item.quantity));
    return { loaded, remaining, matches };
  }, [snapshot]);
  const quantityMatches = counts.matches;
  const hasConstraintErrors = Boolean(snapshot?.result && (snapshot.result.validationIssues.length > 0
    || snapshot.result.operationalFindings?.some(finding => finding.severity === 'error')));
  const hasLoadedCargo = Boolean(snapshot?.result && snapshot.result.placements.length > 0);
  const submissionReady = !whatIf && quantityMatches && hasLoadedCargo && !hasConstraintErrors && snapshot?.recordedVerification?.status === 'passed';
  const disabled = busy || loading || planLoading;
  const reviewReady = canReview && plan?.status === 'submitted' && !isOwnSubmission;
  const prevent = (event: FormEvent, work: () => Promise<void>) => { event.preventDefault(); void run(work); };
  const save = async (replace: boolean) => {
    if (!onCapture || !title.trim()) throw new Error('계획 제목과 현재 시뮬레이터 입력을 확인하세요.');
    const saved = await scopedRequest<Plan>('save', { companyId, title: title.trim(), snapshot: onCapture(), ...(replace && plan ? { planId: plan.id, expectedRevision: plan.revision } : {}) });
    if (!replace && planOffset !== 0) { setPlanOffset(0); setPlanId(''); setPlan(undefined); }
    else { await refresh(companyId, planOffset, false); setPlanId(saved.id); if (saved.id === selectedPlan.current) await loadPlan(companyId, saved.id); }
    setNotice(`계획을 저장했습니다. 버전 ${saved.revision}${!replace && planOffset !== 0 ? ' · 첫 페이지에서 선택하세요.' : ''}`);
  };
  const review = async (decision: 'approved' | 'changes_requested') => {
    if (!plan) return;
    if (decision === 'approved' && !submissionReady) throw new Error('검사 기록·수량 일치·검토용 입력 여부를 확인하세요. 이 버전은 승인할 수 없습니다.');
    if (decision === 'changes_requested' && !comment.trim()) throw new Error('수정 요청 사유를 입력하세요.');
    await scopedRequest('review', { companyId, planId: plan.id, expectedRevision: plan.revision, decision, comment: comment.trim() });
    await refresh(); setComment(''); setNotice(decision === 'approved' ? '검토 승인을 기록했습니다.' : '수정 요청을 기록했습니다.');
  };

  return <div className={`company-workspace ${standalone ? 'standalone' : ''}`} role={standalone ? undefined : 'dialog'} aria-modal={standalone ? undefined : true} aria-label="기업 업무 공간">
    <header className="company-header"><div><span className="company-eyebrow">COMPANY WORKSPACE</span><h1>함께 준비하는 출하 계획</h1><p>계획을 공유하고, 담당자의 검토와 변경 이력을 확인하세요.</p></div><div className="company-header-actions">{member && <><span>{member.name}</span><button disabled={busy} onClick={() => void run(logoutMember)}>로그아웃</button></>}{onClose && <button onClick={onClose} aria-label="기업 업무 공간 닫기">닫기</button>}</div></header>
    {error && <div className="company-alert error" role="alert">{error}{member && <button disabled={disabled} onClick={() => void run(async () => { if (companyId) await refresh(); else { const data = await scopedRequest<{ spaces: Space[] }>('list'); setSpaces(data.spaces); setCompanyId(data.spaces[0]?.id ?? ''); } })}>다시 불러오기</button>}</div>}
    {notice && <div className="company-alert" role="status">{notice}</div>}
    {!member ? <section className="company-auth company-panel"><span className="company-eyebrow">MEMBER ACCESS</span><h2>{signup ? '회원가입' : '회원 로그인'}</h2><p>기존 시뮬레이터 회원 계정으로 기업 공간에 참여합니다.</p><form onSubmit={event => prevent(event, async () => { const result = signup ? await signUpMember(name, email, password) : await loginMember(email, password); if (!result.ok) throw new Error(result.message || '로그인에 실패했습니다.'); setPassword(''); })}>
      {signup && <label>이름<input data-view-only="true" required value={name} maxLength={80} autoComplete="name" onChange={e => setName(e.target.value)} /></label>}
      <label>이메일<input data-view-only="true" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>비밀번호<input data-view-only="true" required type="password" minLength={signup ? 8 : undefined} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? '확인 중…' : signup ? '가입하고 시작' : '로그인'}</button>
    </form><button className="text-button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); }}>{signup ? '기존 계정으로 로그인' : '새 회원 계정 만들기'}</button></section> : <div className="company-layout">
      <aside className="company-sidebar"><section className="company-panel"><h2>기업 공간</h2><label>현재 기업<select data-view-only="true" value={companyId} disabled={disabled} onChange={e => setCompanyId(e.target.value)}><option value="">기업 선택</option>{spaces.map(space => <option key={space.id} value={space.id}>{space.name} · {roleLabel[space.role]}</option>)}</select></label>{!spaces.length && !loading && <p>아직 참여한 기업이 없습니다. 기업을 만들거나 초대코드로 참여하세요.</p>}</section>
      <section className="company-panel"><h3>새 기업 만들기</h3><form onSubmit={event => prevent(event, () => joinSpace('create'))}><label>기업 이름<input data-view-only="true" value={companyName} required maxLength={80} onChange={e => setCompanyName(e.target.value)} /></label><button disabled={disabled || !companyName.trim()}>기업 생성</button></form></section>
      <section className="company-panel"><h3>초대받은 기업 참여</h3><form onSubmit={event => prevent(event, () => joinSpace('accept'))}><label>초대코드<input data-view-only="true" value={inviteCode} required autoComplete="off" maxLength={200} onChange={e => setInviteCode(e.target.value)} /></label><button disabled={disabled || !inviteCode.trim()}>초대 수락</button></form></section></aside>
      <main className="company-main" aria-busy={loading}>{loading && <p role="status">기업 정보를 불러오는 중입니다…</p>}{detail ? <>
      <section className="company-panel company-overview"><div><span className="company-eyebrow">SHARED PLANNING</span><h2>{detail.space.name}</h2><p>{roleLabel[detail.space.role]} 권한 · 직원 {detail.members.length}명 · 현재 페이지 계획 {detail.plans.length}건</p></div><button disabled={disabled} onClick={() => void run(() => refresh())}>새로고침</button></section>
      <div className="company-plans"><section className="company-panel"><h3>출하 계획</h3>{detail.plans.length ? <ul className="company-plan-list">{detail.plans.map(item => <li key={item.id}><button className={item.id === planId ? 'selected' : ''} onClick={() => { setPlanId(item.id); setTitle(item.title); setComment(''); }} disabled={busy}><b>{item.title}</b><span>{statusLabel[item.status] || item.status} · v{item.revision}</span><small>{date(item.updated_at)}</small></button></li>)}</ul> : <p>이 페이지에 저장된 계획이 없습니다.</p>}<nav className="company-pagination" aria-label="계획 목록 페이지"><button disabled={disabled || planOffset === 0} onClick={() => setPlanOffset(offset => Math.max(0, offset - 20))}>이전 페이지</button><span>{Math.floor(planOffset / 20) + 1} 페이지</span><button disabled={disabled || !detail.hasMorePlans} onClick={() => setPlanOffset(offset => offset + 20)}>다음 페이지</button></nav>{canPlan && onCapture && <div className="company-save"><label>계획 제목<input data-view-only="true" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="예: 10월 1차 출하" /></label><button className="primary" disabled={disabled || !title.trim()} onClick={() => void run(() => save(false))}>현재 적재안을 새 계획으로 저장</button>{editable && <button disabled={disabled || !title.trim()} onClick={() => void run(() => save(true))}>선택 계획에 현재 적재안 저장</button>}<small>현재 시뮬레이터 입력과 계산 결과를 복사해 저장합니다.</small></div>}</section>
      <section className="company-panel company-plan-detail">{plan ? <><div className="company-title-row"><h3>{plan.title}</h3><span className={`company-status ${plan.status}`}>{statusLabel[plan.status] || plan.status}</span></div><p>버전 {plan.revision} · {date(plan.updated_at)}</p><div className="company-metrics"><div><span>적재 방식</span><b>{plan.snapshot.mode === 'pallets' ? '팔레트' : '박스'}</b></div><div><span>입력 품목</span><b>{plan.snapshot.cargo.length}종</b></div><div><span>입력 수량</span><b>{plan.snapshot.cargo.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}개</b></div><div><span>저장 배치</span><b>{plan.snapshot.result ? `${plan.snapshot.result.placements.length}개` : '결과 없음'}</b></div></div><p>적재공간 {plan.snapshot.container.length} × {plan.snapshot.container.width} × {plan.snapshot.container.height}m · 허용중량 {plan.snapshot.container.maxPayloadKg.toLocaleString()}kg</p><div className="company-verification"><b>저장 시 검사 기록</b><p>{plan.snapshot.recordedVerification ? `${plan.snapshot.recordedVerification.status} · ${date(plan.snapshot.recordedVerification.testedAt)}` : '저장된 검사 기록 없음'}</p><small>과거 검사 기록입니다. 현재 입력의 PASS 또는 실제 운송 안전 인증을 의미하지 않습니다. 입력 변경 후 다시 계산하고 검증하세요.</small></div>{!submissionReady && <p className="company-eligibility">{whatIf ? '검토용 WHAT-IF 입력은 승인할 수 없습니다.' : !snapshot?.result ? '입력 초안입니다. 계산 결과가 없어 제출할 수 없습니다.' : hasConstraintErrors ? '저장 배치의 제약 오류가 있어 다시 계산·검증해야 합니다.' : !hasLoadedCargo ? '저장된 적재 화물이 없어 제출·승인할 수 없습니다.' : !quantityMatches ? '품목별 입력 수량과 적재·미적재 수량이 일치하지 않습니다.' : '저장 시 통과한 검사 기록이 없어 제출·승인할 수 없습니다.'}</p>}<details><summary>품목별 입력 수량</summary><ul className="company-cargo-list">{plan.snapshot.cargo.map((item, index) => <li key={`${item.id}-${index}`}><span>{item.name || item.id}<small>{item.id}</small></span><span><b>입력 {item.quantity.toLocaleString()}개</b><small>{plan.snapshot.result ? `적재 ${(counts.loaded.get(item.id) ?? 0)} · 미적재 ${(counts.remaining.get(item.id) ?? 0)}` : '계산 결과 없음'}</small></span></li>)}</ul></details>
      {plan.snapshot.result && <details className="company-work-order"><summary>저장된 배치 순서와 미적재 사유</summary><p>저장된 배치 배열 순서입니다. 작업자 승인 또는 운송 안전 인증이 아니며, 실제 작업 전에 현장 조건을 확인하세요.</p><div className="company-order-scroll" tabIndex={0} role="region" aria-label="저장된 배치 좌표 표"><table><thead><tr><th scope="col">순번</th><th scope="col">화물</th><th scope="col">수량</th><th scope="col">X (m)</th><th scope="col">Y (m)</th><th scope="col">Z (m)</th></tr></thead><tbody>{plan.snapshot.result.placements.slice(0, visibleRows).map((placement, index) => <tr key={`${placement.cargoId}-${index}`}><td>{index + 1}</td><td>{plan.snapshot.cargo.find(item => item.id === placement.cargoId)?.name || placement.cargoId}<small>{placement.cargoId}</small></td><td>1</td><td>{placement.x.toFixed(3)}</td><td>{placement.y.toFixed(3)}</td><td>{placement.z.toFixed(3)}</td></tr>)}</tbody></table></div><small>총 {plan.snapshot.result.placements.length}개 중 {Math.min(visibleRows, plan.snapshot.result.placements.length)}개 표시 · 좌표는 저장된 엔진 기준</small>{visibleRows < plan.snapshot.result.placements.length && <button type="button" onClick={() => setVisibleRows(count => count + 100)}>배치 100개 더 보기</button>}<h4>미적재 화물</h4>{plan.snapshot.result.remaining.length ? <ul className="company-cargo-list">{plan.snapshot.result.remaining.slice(0, visibleRows).map((remaining, index) => <li key={`${remaining.cargoId}-${index}`}><span><b>{plan.snapshot.cargo.find(item => item.id === remaining.cargoId)?.name || remaining.cargoId}</b><small>{remaining.reason || '사유 기록 없음'}</small></span><b>{remaining.quantity.toLocaleString()}개</b></li>)}</ul> : <p>저장된 미적재 화물이 없습니다.</p>}{visibleRows < plan.snapshot.result.remaining.length && <button type="button" onClick={() => setVisibleRows(count => count + 100)}>미적재 100건 더 보기</button>}</details>}
      <div className="company-actions">{onLoad && <button disabled={disabled} onClick={() => { try { onLoad(plan.snapshot); setNotice('입력을 시뮬레이터로 불러왔습니다. 다시 계산·검증하세요.'); } catch (reason) { setError(reason instanceof Error ? reason.message : '불러오기에 실패했습니다.'); } }}>시뮬레이터에 입력 불러오기</button>}{canPlan && editable && <button className="primary" disabled={disabled || !submissionReady} onClick={() => void run(async () => { await scopedRequest('submit', { companyId, planId: plan.id, expectedRevision: plan.revision }); await refresh(); setNotice('검토를 요청했습니다.'); })}>승인 검토 제출</button>}</div>
      {plan.status === 'submitted' && canReview && <section className="company-review"><h4>담당자 검토</h4><p>저장된 버전을 검토합니다. 시뮬레이터의 미저장 변경은 승인 대상이 아닙니다. 업무 승인은 실제 운송 안전 인증이 아닙니다.</p>{isOwnSubmission && <p>본인이 제출한 계획은 다른 검토 담당자가 확인해야 합니다.</p>}<label>검토 의견 · 수정 요청 시 필수<textarea data-view-only="true" maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} disabled={!reviewReady || busy} /></label><div className="company-actions"><button className="primary" disabled={disabled || !reviewReady || !submissionReady} onClick={() => void run(() => review('approved'))}>업무 검토 승인</button><button disabled={disabled || !reviewReady || !comment.trim()} onClick={() => void run(() => review('changes_requested'))}>수정 요청</button></div></section>}
      </> : <div className="company-empty"><h3>{planLoading ? '계획을 불러오는 중입니다…' : '계획을 선택하세요'}</h3><p>저장 입력, 검사 기록과 검토 상태를 확인할 수 있습니다.</p></div>}</section></div>
      <section className="company-panel"><h3>직원과 권한</h3><ul className="company-member-list">{detail.members.map(person => <li key={person.member_id}><span><b>{person.display_name}</b>{person.member_id === member.id && <small>내 계정</small>}</span>{canManage && person.member_id !== member.id && person.role !== 'owner' && (role === 'owner' || person.role !== 'admin') ? <select data-view-only="true" aria-label={`${person.display_name} 역할`} value={person.role} disabled={disabled} onChange={e => { const nextRole = e.target.value; void run(async () => { await scopedRequest('role', { companyId, memberId: person.member_id, role: nextRole }); await refresh(); }); }}>{Object.entries(roleLabel).filter(([value]) => value !== 'owner' && (role === 'owner' || value !== 'admin')).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="removed">참여 해제</option></select> : <span>{roleLabel[person.role]}</span>}</li>)}</ul>{canManage && <div className="company-invite"><label>가입된 직원 이메일<input data-view-only="true" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="staff@company.com" /></label><label>초대할 역할<select data-view-only="true" value={inviteRole} disabled={disabled} onChange={e => setInviteRole(e.target.value as Role)}>{(['planner', 'approver', 'viewer'] as const).map(value => <option key={value} value={value}>{roleLabel[value]}</option>)}</select></label><button disabled={disabled || !inviteEmail.includes('@')} onClick={() => void run(async () => { const result = await scopedRequest<{ code: string; expiresAt: string }>('invite', { companyId, role: inviteRole, email: inviteEmail.trim() }); setInvitation(result); })}>초대코드 발급</button>{invitation && <div className="company-invite-result"><b>초대코드</b><code>{invitation.code}</code><small>만료 {date(invitation.expiresAt)} · 입력한 직원만 사용할 수 있는 일회용 코드입니다. 직원에게 직접 전달하세요.</small></div>}</div>}</section>
      <section className="company-panel"><h3>감사 이력</h3>{detail.events.length ? <ol className="company-event-list">{detail.events.map(event => <li key={event.id}><div><b>{actionLabel[event.action] || event.action}</b><span>{event.actor_name} · {date(event.created_at)}</span></div>{event.plan_id && <small>계획 {detail.plans.find(item => item.id === event.plan_id)?.title || event.plan_id}</small>}{event.comment && <p>{event.comment}</p>}</li>)}</ol> : <p>기록된 활동이 없습니다.</p>}</section>
      </> : !loading && <section className="company-panel company-empty"><h2>기업 공간에서 시작하세요</h2><p>기업을 선택하거나 초대코드를 입력하면 공유된 계획을 볼 수 있습니다.</p></section>}</main>
    </div>}
  </div>;
}
