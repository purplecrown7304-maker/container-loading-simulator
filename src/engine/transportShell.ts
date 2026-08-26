import type { ContainerSpec } from './types';

export type TransportShell = {
  floor: true;
  roof: boolean;
  frontWall: boolean;
  rearWall: boolean;
  leftWall: boolean;
  rightWall: boolean;
  description: string;
};

/**
 * 어떤 외곽면을 Rapier의 고정 강체 collider로 취급할지 결정한다.
 * 기존 데이터는 일반 Dry 컨테이너와 동일한 6면 강체 셸로 유지한다.
 *
 * 커튼사이더/메가 트레일러의 커튼과 연성 지붕은 화물 지지용 구조벽이
 * 아니므로 collider를 만들지 않는다. 화물이 그 방향으로 움직이면
 * 경계 이탈/이동량으로 불안정 판정되어 고박재가 실제 역할을 해야 한다.
 */
export function buildTransportShell(spec: ContainerSpec): TransportShell {
  const curtainSides = spec.transportKind === 'truck' && spec.sideWallModel === 'curtain';
  const softRoof = spec.transportKind === 'truck' && (spec.roofModel === 'soft' || spec.roofModel === 'open');

  return {
    floor: true,
    roof: !softRoof,
    frontWall: true,
    rearWall: true,
    leftWall: !curtainSides,
    rightWall: !curtainSides,
    description: curtainSides
      ? '트럭 바닥·전후 강체벽 + 측면 커튼 비지지 모델'
      : spec.transportKind === 'truck'
        ? '트럭 박스형 강체 적재함 모델'
        : '컨테이너 6면 강체 셸 모델',
  };
}
