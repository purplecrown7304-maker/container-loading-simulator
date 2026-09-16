import { useEffect, useRef } from 'react';
import {
  ENTERPRISE_PACKAGING_PLANNER_EVENT,
  ENTERPRISE_PACKAGING_PLANNER_KEY,
  readEnterprisePackagingPlannerState,
  writeEnterprisePackagingPlannerState,
} from './enterprisePackagingPlannerStore';
import { MEMBER_AUTH_EVENT, hasSupabaseMemberSession, readSupabaseMember } from './memberAuth';
import { fetchMemberCloudData, saveMemberCloudData, type MemberCloudData } from './memberCloudData';
import { chooseMemberSyncDirection, hasMemberCatalogData } from './memberCloudSyncPolicy';
import { LOCAL_OPERATOR_EVENT, operatorScopedStorageKey, readLocalOperator, type LocalOperator } from './localOperator';
import {
  PERSONAL_BOX_CATALOG_EVENT,
  personalBoxCatalogKey,
  readPersonalBoxCatalog,
  writePersonalBoxCatalog,
} from './personalBoxCatalog';

export const MEMBER_CLOUD_SYNC_EVENT = 'container-loading:member-cloud-data-synced';
const DIRTY_KEY_PREFIX = 'container-loading:member-cloud-data-dirty:v1';

type ObservedStorage = {
  operatorId: string;
  plannerRaw: string | null;
  personalBoxesRaw: string | null;
};

function dirtyKey(operator: LocalOperator) {
  return `${DIRTY_KEY_PREFIX}:${encodeURIComponent(operator.id)}`;
}

function isDirty(operator: LocalOperator) {
  return localStorage.getItem(dirtyKey(operator)) === '1';
}

function setDirty(operator: LocalOperator, dirty: boolean) {
  if (dirty) localStorage.setItem(dirtyKey(operator), '1');
  else localStorage.removeItem(dirtyKey(operator));
}

function currentMemberOperator(): LocalOperator | null {
  if (!hasSupabaseMemberSession()) return null;
  const member = readSupabaseMember();
  const local = readLocalOperator();
  if (!member || !local || member.id !== local.id) return null;
  return local;
}

function readLocalSnapshot(operator: LocalOperator): Omit<MemberCloudData, 'updatedAt'> {
  return {
    plannerState: readEnterprisePackagingPlannerState(),
    personalBoxes: readPersonalBoxCatalog(operator),
  };
}

function observeStorage(operator: LocalOperator): ObservedStorage {
  return {
    operatorId: operator.id,
    plannerRaw: localStorage.getItem(operatorScopedStorageKey(ENTERPRISE_PACKAGING_PLANNER_KEY, operator)),
    personalBoxesRaw: localStorage.getItem(personalBoxCatalogKey(operator)),
  };
}

export default function MemberCloudDataBridge() {
  const suppressUploadRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const uploadTimerRef = useRef<number | null>(null);
  const syncRunningRef = useRef<Promise<void> | null>(null);
  const observedStorageRef = useRef<ObservedStorage | null>(null);

  useEffect(() => {
    const announce = (detail: Record<string, unknown>) => {
      window.dispatchEvent(new CustomEvent(MEMBER_CLOUD_SYNC_EVENT, { detail }));
    };

    const refreshObservedStorage = (operator: LocalOperator | null = currentMemberOperator()) => {
      observedStorageRef.current = operator ? observeStorage(operator) : null;
    };

    const uploadLatest = async () => {
      const operator = currentMemberOperator();
      if (!operator) return;
      const snapshot = readLocalSnapshot(operator);
      try {
        const updatedAt = await saveMemberCloudData(snapshot);
        setDirty(operator, false);
        refreshObservedStorage(operator);
        announce({ status: 'uploaded', updatedAt: updatedAt ?? null });
      } catch (error) {
        setDirty(operator, true);
        announce({ status: 'offline', error: error instanceof Error ? error.message : String(error) });
      }
    };

    const queueUpload = () => {
      if (suppressUploadRef.current) return;
      const operator = currentMemberOperator();
      if (!operator) return;
      setDirty(operator, true);
      if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
      uploadTimerRef.current = window.setTimeout(() => {
        uploadTimerRef.current = null;
        void uploadLatest();
      }, 350);
    };

    const synchronize = async () => {
      const operator = currentMemberOperator();
      if (!operator) return;
      const local = readLocalSnapshot(operator);
      try {
        const remote = await fetchMemberCloudData();
        const direction = chooseMemberSyncDirection({
          remoteExists: remote !== null,
          localDirty: isDirty(operator),
          localHasData: hasMemberCatalogData(local),
        });

        if (direction === 'upload') {
          const updatedAt = await saveMemberCloudData(local);
          setDirty(operator, false);
          refreshObservedStorage(operator);
          announce({ status: 'uploaded', reason: remote ? 'local-dirty' : 'initial-migration', updatedAt: updatedAt ?? null });
          return;
        }

        if (direction === 'download' && remote) {
          suppressUploadRef.current = true;
          try {
            // 개인 박스를 먼저 복원해야 플래너 저장 시 해당 박스의 최대 적층단 정책도 같은 값으로 합쳐진다.
            writePersonalBoxCatalog(operator, remote.personalBoxes);
            if (remote.plannerState) writeEnterprisePackagingPlannerState(remote.plannerState, true);
          } finally {
            suppressUploadRef.current = false;
          }
          setDirty(operator, false);
          refreshObservedStorage(operator);
          announce({ status: 'downloaded', updatedAt: remote.updatedAt ?? null });
          return;
        }

        refreshObservedStorage(operator);
        announce({ status: 'empty' });
      } catch (error) {
        announce({ status: 'offline', error: error instanceof Error ? error.message : String(error) });
      }
    };

    const runSynchronize = () => {
      if (syncRunningRef.current) return syncRunningRef.current;
      const running = synchronize().finally(() => {
        if (syncRunningRef.current === running) syncRunningRef.current = null;
      });
      syncRunningRef.current = running;
      return running;
    };

    const queueSynchronize = (delay = 80) => {
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        void runSynchronize();
      }, delay);
    };

    const onAuthChanged = () => {
      observedStorageRef.current = null;
      queueSynchronize(100);
    };
    const onOperatorChanged = () => {
      observedStorageRef.current = null;
      queueSynchronize(40);
    };
    const onOnline = () => queueSynchronize(0);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') queueSynchronize(100);
    };

    window.addEventListener(MEMBER_AUTH_EVENT, onAuthChanged);
    window.addEventListener(LOCAL_OPERATOR_EVENT, onOperatorChanged);
    window.addEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, queueUpload);
    window.addEventListener(PERSONAL_BOX_CATALOG_EVENT, queueUpload);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);

    const observerTimer = window.setInterval(() => {
      const operator = currentMemberOperator();
      if (!operator) {
        observedStorageRef.current = null;
        return;
      }
      const next = observeStorage(operator);
      const previous = observedStorageRef.current;
      if (!previous || previous.operatorId !== next.operatorId) {
        observedStorageRef.current = next;
        return;
      }
      if (previous.plannerRaw !== next.plannerRaw || previous.personalBoxesRaw !== next.personalBoxesRaw) {
        observedStorageRef.current = next;
        queueUpload();
      }
    }, 800);

    refreshObservedStorage();
    queueSynchronize(120);

    return () => {
      window.removeEventListener(MEMBER_AUTH_EVENT, onAuthChanged);
      window.removeEventListener(LOCAL_OPERATOR_EVENT, onOperatorChanged);
      window.removeEventListener(ENTERPRISE_PACKAGING_PLANNER_EVENT, queueUpload);
      window.removeEventListener(PERSONAL_BOX_CATALOG_EVENT, queueUpload);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(observerTimer);
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
    };
  }, []);

  return null;
}
