import { useLayoutEffect } from 'react';
import { ADMIN_ACCESS_EVENT, isAdminSession } from './adminAccess';
import {
  LOCAL_OPERATOR_EVENT,
  adoptRemoteOperator,
  logoutLocalOperator,
  operatorScopedStorageKey,
  readLocalOperator,
  type LocalOperator,
} from './localOperator';
import { MEMBER_AUTH_EVENT, readSupabaseMember } from './memberAuth';

const LEGACY_CATALOG_KEY = 'container-loading-box-catalog-v1';
const LEGACY_CATALOG_RECOVERY_KEY = 'container-loading-box-catalog-v1:recovery';
const USER_CATALOG_KEY = 'container-loading-user-box-catalog-v1';
const ADMIN_BOX_OPERATOR: LocalOperator = { id: 'admin', name: '관리자' };

function preserveLegacyCatalog() {
  if (typeof window === 'undefined') return;
  try {
    const legacy = localStorage.getItem(LEGACY_CATALOG_KEY);
    if (legacy && localStorage.getItem(LEGACY_CATALOG_RECOVERY_KEY) == null) {
      localStorage.setItem(LEGACY_CATALOG_RECOVERY_KEY, legacy);
    }
  } catch {
    // 브라우저 저장소를 사용할 수 없으면 기존 동작을 유지한다.
  }
}

// WorkspaceTools의 과거 버전은 이 키를 mount 시 삭제한다. 모듈이 로드되는 즉시
// 백업해 두면 구버전 전역 박스 목록을 관리자 개인 목록으로 한 번 복구할 수 있다.
preserveLegacyCatalog();

export function migrateLegacyAdminBoxCatalog() {
  if (typeof window === 'undefined' || !isAdminSession()) return false;
  try {
    const scopedKey = operatorScopedStorageKey(USER_CATALOG_KEY, ADMIN_BOX_OPERATOR);
    // 빈 배열도 사용자가 의도적으로 만든 현재 목록일 수 있으므로 키가 이미 있으면 건드리지 않는다.
    if (localStorage.getItem(scopedKey) != null) return false;

    const source = localStorage.getItem(LEGACY_CATALOG_KEY)
      ?? localStorage.getItem(LEGACY_CATALOG_RECOVERY_KEY);
    if (!source) return false;
    const parsed = JSON.parse(source) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return false;

    localStorage.setItem(scopedKey, source);
    return true;
  } catch {
    return false;
  }
}

/**
 * 상단 로그인과 박스 관리가 서로 다른 로그인 원본을 보던 문제를 한 곳에서 맞춘다.
 * - 회원: Supabase 회원 세션을 LocalOperator로 동기화
 * - 관리자: 별도 admin 세션도 박스 관리에서 로그인된 사용자로 취급
 *
 * WorkspaceTools는 개인 박스 키를 LocalOperator 기준으로 읽으므로 이 브리지가 두 인증
 * 체계를 같은 작업자 ID로 연결한다. 비밀번호나 인증 토큰은 복사하지 않는다.
 */
export function syncBoxManagerIdentity() {
  if (typeof window === 'undefined') return;

  const member = readSupabaseMember();
  if (member) {
    const local = readLocalOperator();
    if (!local || local.id !== member.id || local.name !== member.name || local.email !== member.email) {
      adoptRemoteOperator(member);
    }
    return;
  }

  if (isAdminSession()) {
    const local = readLocalOperator();
    if (!local || local.id !== ADMIN_BOX_OPERATOR.id) adoptRemoteOperator(ADMIN_BOX_OPERATOR);
    migrateLegacyAdminBoxCatalog();
    return;
  }

  // 관리자 세션이 끝났는데 호환용 작업자만 남아 있으면 일반 로그인으로 오인하지 않게 정리한다.
  const local = readLocalOperator();
  if (local?.id === ADMIN_BOX_OPERATOR.id) logoutLocalOperator();
}

export default function BoxManagerAuthBridge() {
  useLayoutEffect(() => {
    let syncing = false;
    const sync = () => {
      if (syncing) return;
      syncing = true;
      try {
        syncBoxManagerIdentity();
      } finally {
        syncing = false;
      }
    };

    sync();
    window.addEventListener(ADMIN_ACCESS_EVENT, sync);
    window.addEventListener(MEMBER_AUTH_EVENT, sync);
    window.addEventListener(LOCAL_OPERATOR_EVENT, sync);
    return () => {
      window.removeEventListener(ADMIN_ACCESS_EVENT, sync);
      window.removeEventListener(MEMBER_AUTH_EVENT, sync);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, sync);
    };
  }, []);

  return null;
}
