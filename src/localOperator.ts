export const LOCAL_OPERATOR_EVENT = 'container-loading:local-operator-updated';

const LOCAL_SESSION_KEY = 'container-loading-local-operator-v1';

export type LocalOperator = {
  id: string;
  name: string;
};

function normalizeOperatorId(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function readLocalOperator(): LocalOperator | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null') as Partial<LocalOperator> | null;
    const name = parsed?.name?.trim();
    if (!name) return null;
    return { id: parsed?.id?.trim() || normalizeOperatorId(name), name };
  } catch {
    return null;
  }
}

export function loginLocalOperator(name: string): LocalOperator | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const next: LocalOperator = { id: normalizeOperatorId(trimmed), name: trimmed };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent<LocalOperator>(LOCAL_OPERATOR_EVENT, { detail: next }));
  return next;
}

export function logoutLocalOperator(): void {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  window.dispatchEvent(new CustomEvent<null>(LOCAL_OPERATOR_EVENT, { detail: null }));
}

export function operatorScopedStorageKey(baseKey: string, operator: LocalOperator): string {
  return `${baseKey}:${encodeURIComponent(operator.id)}`;
}
