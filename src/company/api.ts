import { readSupabaseMemberSessionToken } from '../memberAuth';
import { CONTAINER_MEMBER_API_URL, supabasePublicHeaders } from '../supabaseConfig';

const messages: Record<string, string> = {
  member_auth_required: '로그인이 만료되었습니다. 다시 로그인하세요.',
  company_forbidden: '이 회사에 대한 권한이 없거나 소속이 해제되었습니다.',
  company_conflict: '다른 직원이 변경했습니다. 새로고침 후 최신 버전에서 다시 진행하세요.',
  company_invalid: '입력 내용을 확인하세요.',
  company_invite_invalid: '초대가 만료되었거나 이미 사용되었습니다. 초대받은 이메일로 로그인하세요.',
  company_review_required: '수량이 일치하고 저장 시 검사 기록이 통과한 일반 계획만 검토를 요청할 수 있습니다.',
  company_self_review: '검토를 요청한 담당자와 다른 승인자가 확인해야 합니다.',
  company_unavailable: '기업 서비스 서버 준비가 필요합니다. 개인 적재 작업은 계속 이용할 수 있습니다.',
};

export class CompanyApiError extends Error {
  constructor(public code: string) { super(messages[code] ?? '기업 서비스 요청에 실패했습니다. 다시 시도하세요.'); }
}

export async function companyRequest<T>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = readSupabaseMemberSessionToken();
  if (!token) throw new CompanyApiError('member_auth_required');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(CONTAINER_MEMBER_API_URL, {
      method: 'POST', signal: controller.signal,
      headers: supabasePublicHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
      body: JSON.stringify({ ...payload, action: 'company', op }),
    });
    const body = await response.json() as { ok?: boolean; data?: T; error?: string };
    if (!response.ok || !body.ok) throw new CompanyApiError(body.error === 'unknown_action' ? 'company_unavailable' : body.error ?? 'company_unavailable');
    return body.data as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('서버 응답이 지연되고 있습니다. 새로고침하여 저장 여부를 확인하세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
