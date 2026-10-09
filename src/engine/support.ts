import type { Placement, ContainerSpec } from './types';

const EPS = 1e-9;
/** Legacy rules use one conservative contact tolerance at every validation stage. */
export const CONTACT_TOLERANCE_M = 0.001;
export const MIN_SUPPORT_RATIO = 0.8;

/** Internal calculation context: created only by validated WHAT-IF resolution.
 * Symbols are copied with scenario budgets but never persist as equipment ratings. */
export const REVIEW_SUPPORT_RATIO: unique symbol = Symbol('what-if-support-ratio');
export function scenarioSupportRatio(container: ContainerSpec, fallback = MIN_SUPPORT_RATIO): number {
  const value = (container as ContainerSpec & { [REVIEW_SUPPORT_RATIO]?: number })[REVIEW_SUPPORT_RATIO];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MIN_SUPPORT_RATIO ? value : fallback;
}

export type SupportSurface = {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
};

export type SupportAssessment = {
  supported: boolean;
  supportRatio: number;
  centerInsideSupportEnvelope: boolean;
  contactCount: number;
};

function overlapRect(candidate: Placement, support: Pick<Placement, 'x' | 'y' | 'length' | 'width'>) {
  const minX = Math.max(candidate.x, support.x);
  const maxX = Math.min(candidate.x + candidate.length, support.x + support.length);
  const minY = Math.max(candidate.y, support.y);
  const maxY = Math.min(candidate.y + candidate.width, support.y + support.width);
  if (maxX - minX <= EPS || maxY - minY <= EPS) return null;
  return { minX, maxX, minY, maxY, area: (maxX - minX) * (maxY - minY) };
}

/** Actual contact only: the same links govern support, stacking and transmitted load. */
export function supportContactArea(lower: Placement, upper: Placement): number {
  if (lower === upper || lower.z >= upper.z || Math.abs(lower.z + lower.height - upper.z) > CONTACT_TOLERANCE_M) return 0;
  return overlapRect(upper, lower)?.area ?? 0;
}

function liesOnSurface(candidate: Placement, surface: SupportSurface) {
  if (Math.abs(candidate.z - surface.z) > CONTACT_TOLERANCE_M) return false;
  return candidate.x >= surface.x - EPS &&
    candidate.y >= surface.y - EPS &&
    candidate.x + candidate.length <= surface.x + surface.length + EPS &&
    candidate.y + candidate.width <= surface.y + surface.width + EPS;
}

/**
 * 후보 생성·최종 감사·운영 검증에서 공유하는 최소 지지 조건.
 * - 바닥/팔레트 판 위에 직접 놓이면 통과.
 * - 적층 화물은 바닥면의 80% 이상이 바로 아래 화물에 닿아야 한다.
 * - 후보의 무게중심 투영점이 지지 접촉들의 외곽 범위 안에 있어야 한다.
 * 벽 쌓기/잔여 채우기는 99.9%, 수동 이동은 100%를 요구하는 더 엄격한 단계다.
 * 이 정적 하한을 통과해도 미끄러짐/전도/동적 안정성 검증을 대신하지 않는다.
 */
export function assessPlacementSupport(
  candidate: Placement,
  placements: Placement[],
  baseSurface?: SupportSurface,
  minimumRatio = MIN_SUPPORT_RATIO,
): SupportAssessment {
  if (baseSurface && liesOnSurface(candidate, baseSurface)) {
    return { supported: true, supportRatio: 1, centerInsideSupportEnvelope: true, contactCount: 1 };
  }
  if (!baseSurface && candidate.z <= CONTACT_TOLERANCE_M) {
    return { supported: true, supportRatio: 1, centerInsideSupportEnvelope: true, contactCount: 1 };
  }

  const contacts: Array<{ minX: number; maxX: number; minY: number; maxY: number; area: number }> = [];
  for (const lower of placements) {
    if (!supportContactArea(lower, candidate)) continue;
    const overlap = overlapRect(candidate, lower);
    if (overlap) contacts.push(overlap);
  }

  if (!contacts.length) {
    return { supported: false, supportRatio: 0, centerInsideSupportEnvelope: false, contactCount: 0 };
  }

  const footprint = Math.max(EPS, candidate.length * candidate.width);
  // 같은 높이의 박스는 서로 겹치지 않으므로 접촉 면적 합산은 실질적으로 중복되지 않는다.
  const supportedArea = Math.min(footprint, contacts.reduce((sum, contact) => sum + contact.area, 0));
  const supportRatio = supportedArea / footprint;
  const envelope = {
    minX: Math.min(...contacts.map((contact) => contact.minX)),
    maxX: Math.max(...contacts.map((contact) => contact.maxX)),
    minY: Math.min(...contacts.map((contact) => contact.minY)),
    maxY: Math.max(...contacts.map((contact) => contact.maxY)),
  };
  const centerX = candidate.x + candidate.length / 2;
  const centerY = candidate.y + candidate.width / 2;
  const centerInsideSupportEnvelope = centerX >= envelope.minX - EPS && centerX <= envelope.maxX + EPS &&
    centerY >= envelope.minY - EPS && centerY <= envelope.maxY + EPS;

  return {
    supported: supportRatio + EPS >= minimumRatio && centerInsideSupportEnvelope,
    supportRatio,
    centerInsideSupportEnvelope,
    contactCount: contacts.length,
  };
}

export function hasAdequateSupport(
  candidate: Placement,
  placements: Placement[],
  baseSurface?: SupportSurface,
  minimumRatio = MIN_SUPPORT_RATIO,
) {
  return assessPlacementSupport(candidate, placements, baseSurface, minimumRatio).supported;
}
