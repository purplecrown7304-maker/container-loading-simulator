export type MemberCatalogSnapshotLike = {
  plannerState?: {
    products?: unknown[];
    boxes?: unknown[];
  } | null;
  personalBoxes?: unknown[];
};

export type MemberSyncDirection = 'upload' | 'download' | 'noop';

export function hasMemberCatalogData(snapshot: MemberCatalogSnapshotLike) {
  return Boolean(
    snapshot.plannerState?.products?.length
    || snapshot.plannerState?.boxes?.length
    || snapshot.personalBoxes?.length,
  );
}

/**
 * 빈 새 브라우저가 서버 데이터를 덮어쓰지 않도록 서버가 존재하면 기본적으로 내려받는다.
 * 로컬에서 변경이 발생해 dirty 상태라면 전체 삭제처럼 목록이 비어 있는 변경도 서버에 반영한다.
 * 서버에 아직 데이터가 없으면 기존 브라우저의 실제 목록을 최초 1회 마이그레이션한다.
 */
export function chooseMemberSyncDirection(options: {
  remoteExists: boolean;
  localDirty: boolean;
  localHasData: boolean;
}): MemberSyncDirection {
  if (options.localDirty) return 'upload';
  if (options.remoteExists) return 'download';
  if (options.localHasData) return 'upload';
  return 'noop';
}
