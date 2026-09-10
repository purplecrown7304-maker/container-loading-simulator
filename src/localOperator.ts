export const LOCAL_OPERATOR_EVENT = 'container-loading:local-operator-updated';

const LOCAL_SESSION_KEY = 'container-loading-local-operator-v1';

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
    const parsed = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null') as Partial<LocalOperator> | null;
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
  if (next) localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(next));
  else localStorage.removeItem(LOCAL_SESSION_KEY);
  window.dispatchEvent(new CustomEvent<LocalOperator | null>(LOCAL_OPERATOR_EVENT, { detail: next }));
}

export function loginLocalOperator(name: string): LocalOperator | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const next: LocalOperator = { id: normalizeOperatorId(trimmed), name: trimmed };
  writeLocalOperator(next);
  return next;
}

export function adoptRemoteOperator(next: LocalOperator): LocalOperator {
  const previous = readLocalOperator();
  if (previous && previous.id !== next.id) {
    const oldSuffix = `:${encodeURIComponent(previous.id)}`;
    const newSuffix = `:${encodeURIComponent(next.id)}`;
    const copies: Array<[string, string]> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.endsWith(oldSuffix)) continue;
      const value = localStorage.getItem(key);
      if (value == null) continue;
      copies.push([`${key.slice(0, -oldSuffix.length)}${newSuffix}`, value]);
    }
    for (const [key, value] of copies) {
      if (localStorage.getItem(key) == null) localStorage.setItem(key, value);
    }
  }
  writeLocalOperator(next);
  return next;
}

export function logoutLocalOperator(): void {
  writeLocalOperator(null);
}

export function operatorScopedStorageKey(baseKey: string, operator: LocalOperator): string {
  return `${baseKey}:${encodeURIComponent(operator.id)}`;
}
