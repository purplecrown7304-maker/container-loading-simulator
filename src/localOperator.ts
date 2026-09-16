export const LOCAL_OPERATOR_EVENT = 'container-loading:local-operator-updated';
export const LOCAL_OPERATOR_SESSION_KEY = 'container-loading-local-operator-v1';

export type LocalOperator = {
  id: string;
  name: string;
  email?: string;
};

function normalizeOperatorId(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function readLocalOperator(): LocalOperator | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(LOCAL_OPERATOR_SESSION_KEY) || 'null') as Partial<LocalOperator> | null;
    const name = parsed?.name?.trim();
    if (!name) return null;
    return {
      id: parsed?.id?.trim() || normalizeOperatorId(name),
      name,
      email: parsed?.email?.trim() || undefined,
    };
  } catch {
    return null;
  }
}

function writeLocalOperator(next: LocalOperator | null) {
  if (next) sessionStorage.setItem(LOCAL_OPERATOR_SESSION_KEY, JSON.stringify(next));
  else sessionStorage.removeItem(LOCAL_OPERATOR_SESSION_KEY);
  window.dispatchEvent(new CustomEvent<LocalOperator | null>(LOCAL_OPERATOR_EVENT, { detail: next }));
}

/** 이전 브라우저 localStorage의 로그인 표시만 sessionStorage로 1회 옮길 때 사용한다. */
export function seedTransientLocalOperator(raw: string | null) {
  if (typeof window === 'undefined' || sessionStorage.getItem(LOCAL_OPERATOR_SESSION_KEY) || !raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalOperator> | null;
    const name = parsed?.name?.trim();
    if (!name) return;
    writeLocalOperator({
      id: parsed?.id?.trim() || normalizeOperatorId(name),
      name,
      email: parsed?.email?.trim() || undefined,
    });
  } catch {
    // 손상된 예전 로그인 표시는 무시한다.
  }
}

export function loginLocalOperator(name: string): LocalOperator | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const next: LocalOperator = { id: normalizeOperatorId(trimmed), name: trimmed };
  writeLocalOperator(next);
  return next;
}

export function adoptRemoteOperator(next: LocalOperator): LocalOperator {
  // 계정 데이터의 영구 이전은 Supabase 초기화 계층에서 처리한다.
  // 이 함수는 현재 탭의 UI용 작업자 표시만 유지한다.
  writeLocalOperator(next);
  return next;
}

export function logoutLocalOperator(): void {
  writeLocalOperator(null);
}

export function operatorScopedStorageKey(baseKey: string, operator: LocalOperator): string {
  return `${baseKey}:${encodeURIComponent(operator.id)}`;
}
