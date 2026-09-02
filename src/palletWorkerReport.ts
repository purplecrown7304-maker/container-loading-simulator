export * from './palletWorkerReportV2';

import type { CargoItem, ContainerSpec } from './engine/types';
import { openPalletLoadingReport as openPalletLoadingReportV2 } from './palletWorkerReportV2';

/**
 * 작업지시서는 최종 적재/검증을 시작하는 기능이 아니다.
 * 최종 적재 진행에서 만들어진 완료 결과를 그대로 열어 보는 전용 출력물이다.
 * 검증 미완료 여부는 V2의 현재 적재안 인증 일치 검사에서 차단한다.
 */
export function openPalletLoadingReport(container: ContainerSpec, cargo: CargoItem[]): boolean {
  return openPalletLoadingReportV2(container, cargo);
}
