// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { describe, expect, it } from 'vitest';
import { uiMessage, uiText } from './uiLanguage';
import { uiMessages } from './uiMessages';
import { uiMessagesEngine } from './uiMessagesEngine';
import { auditLoading } from './engine/loadingAudit';
import { explainLoading } from './engine/explanation';
import { explainStackLimitedRemaining, declaredStackCap } from './engine/stackLimitReason';
import { resolveLimitReview } from './engine/limitReview';
import { loadContainer } from './engine/loadingEngine';
import { packOnPallets, defaultPalletSpec, type PalletSpec } from './engine/palletOptimization';
import { describePhysicsMotion, runPhysicsValidationSuite, runPhysicsValidation } from './engine/physicsValidation';
import { assessZoneUtilization, detectZoneFlowWarning } from './engine/zoneUtilization';
import { buildDirectReoptimizationCargoProfiles } from './engine/finalResultOptimization';
import type { CargoItem, ContainerSpec, LoadingResult, Placement } from './engine/types';

// Keep this list tied to the engine modules owned by this diagnostic catalog.
const sources = [
  'asyncLoading', 'blockSpaceBeamPacker', 'blockSpaceBeamPackerV2', 'cgCompliantPlan', 'explanation',
  'finalResultOptimization', 'floorLoadLimit', 'groupPlacement', 'heavyInnerBlockPacker', 'heavyInnerPolicy',
  'hybridLoadingOptimizer', 'inputPreflight', 'levelBlockPacker', 'limitReview', 'loading.worker',
  'loadingAudit', 'loadingEngine', 'manualEditPolicy', 'manualPlacement', 'mixedModePacking',
  'palletOptimization', 'palletPacking', 'palletRecommendation.worker', 'palletRecommendationAsync',
  'physicsOptimizer', 'physicsScenario.worker', 'physicsValidation', 'residualPacking', 'stackLimitReason',
  'strictWallPacker', 'zoneUtilization',
];

/** Compiler lexer skips comments and preserves complete templates, including nested braces.
 * Only repository-owned source is scanned. No application data or interpolated expression runs. */
function sourceKeys(source: string): string[] {
  const scanner = createScanner(true, undefined, source);
  const keys: string[] = [];
  const frames: Array<{ key: string; slot: number; braces: number }> = [];
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    if (token === SyntaxKind.StringLiteral || token === SyntaxKind.NoSubstitutionTemplateLiteral) {
      keys.push(scanner.getTokenValue());
    } else if (token === SyntaxKind.TemplateHead) {
      frames.push({ key: `${scanner.getTokenValue()}{0}`, slot: 1, braces: 0 });
    } else if (frames.length && token === SyntaxKind.OpenBraceToken) {
      frames[frames.length - 1].braces += 1;
    } else if (frames.length && token === SyntaxKind.CloseBraceToken) {
      const frame = frames[frames.length - 1];
      if (frame.braces > 0) { frame.braces -= 1; continue; }
      const tail = scanner.reScanTemplateToken(false);
      frame.key += scanner.getTokenValue();
      if (tail === SyntaxKind.TemplateTail) { keys.push(frame.key); frames.pop(); }
      else frame.key += `{${frame.slot++}}`;
    }
  }
  return keys.filter(key => /[가-힣]/.test(key));
}
const container: ContainerSpec = { length: 4, width: 2, height: 3, maxPayloadKg: 1000 };
const id = '주의 위험. $& [화물]';
const cargo = (patch: Partial<CargoItem> = {}): CargoItem => ({
  id, name: '불러오기', length: 1, width: 1, height: .5, weightKg: 10,
  quantity: 20, allowRotation: true, ...patch,
});
const placement = (patch: Partial<Placement> = {}): Placement => ({
  cargoId: id, x: 0, y: 0, z: 0, length: 1, width: 1, height: .5, weightKg: 10, ...patch,
});
function localized(message: string, names: string[] = []) {
  expect(uiMessage(message, 'ko')).toBe(message);
  for (const locale of ['en', 'vi'] as const) {
    const translated = uiMessage(message, locale);
    expect(translated, message).not.toBe(message);
    expect(names.reduce((text, name) => text.replaceAll(name, ''), translated), message).not.toMatch(/[가-힣]/);
    expect(translated, message).not.toMatch(/\{\d+\}/);
    // Existing preflight translations spell the constant 0 as ‘zero’; the bound is unchanged.
    expect(translated.replace(/\bzero\b/g, '0').match(/[+-]?\d+(?:\.\d+)?/g)?.sort() ?? [], message)
      .toEqual(message.match(/[+-]?\d+(?:\.\d+)?/g)?.sort() ?? []);
  }
}

it('covers the current Korean literals and normalized templates in every scoped engine source', () => {
  const missing: string[] = [];
  let count = 0;
  for (const file of sources) for (const key of sourceKeys(readFileSync(new URL(`engine/${file}.ts`, import.meta.url), 'utf8'))) {
    count += 1;
    if (!uiMessages[key] && !uiMessages[key.trim()]) missing.push(`${file}: ${key}`);
  }
  expect(count).toBeGreaterThan(200);
  expect(missing).toEqual([]);
});

it('registers every engine key and preserves exact placeholder contracts', () => {
  const slots = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  for (const [key, pair] of Object.entries(uiMessagesEngine)) {
    expect(uiMessages[key], key).toBeDefined();
    for (const value of pair) {
      expect(value.trim(), key).not.toBe(''); expect(value, key).not.toMatch(/[가-힣]/);
      expect(slots(value), key).toEqual(slots(key));
    }
  }
});

describe('real generated engine diagnostics', () => {
  it('localizes every declared stack-cap cause combination and its remaining-cargo explanation', () => {
    for (let mask = 1; mask < 16; mask += 1) {
      const item = cargo({ strengthUnverified: Boolean(mask & 1), floorOnly: Boolean(mask & 2),
        ...(mask & 4 ? { maxStackLayers: 1 } : {}), ...(mask & 8 ? { maxTopLoadKg: 0 } : {}) });
      const before = JSON.stringify(item);
      const cap = declaredStackCap(item)!;
      localized(cap.source);
      const remaining = explainStackLimitedRemaining(container, [item], [{ cargoId: id, quantity: 3, reasonCode: 'NO_FEASIBLE_EMS', reason: '현재 배치의 안전한 추가 적재 위치 없음' }]);
      expect(remaining[0].reasonCode).toBe('STACK_LIMIT');
      localized(remaining[0].reason);
      expect(JSON.stringify(item)).toBe(before);
    }
    const item = cargo({ maxTopLoadKg: 17.5, maxStackLayers: 2 });
    localized(declaredStackCap(item)!.source);
  });

  it('localizes review input bounds with opaque cargo IDs and unchanged review status', () => {
    const space: ContainerSpec = { ...container, limitReview: { mode: 'what-if', maxPayloadKg: 500,
      floorLoadLimitKgPerM2: 0, minimumSupportRatio: 0, cargoLimits: { [id]: { maxStackLayers: .5, maxTopLoadKg: -1 } },
      simulation: { maxDisplacementMm: 0, maxRotationDeg: 181 } } };
    const items = [cargo({ maxStackLayers: 2, maxTopLoadKg: 17.5 })];
    const before = JSON.stringify([space, items]);
    const resolution = resolveLimitReview(space, items);
    expect(resolution.status).toBe('invalid'); expect(resolution.errors).toHaveLength(7);
    for (const error of resolution.errors) localized(error, [id]);
    const originalErrors = resolveLimitReview({ ...space, length: 0 }, [cargo({ weightKg: 0 })]).errors;
    for (const error of originalErrors) localized(error, [id]);
    expect(JSON.stringify([space, items])).toBe(before);
  });

  it('localizes static audit findings while preserving IDs, issue types and actual numeric values', () => {
    const items = [cargo({ quantity: 1, floorOnly: true, maxStackLayers: 1, maxTopLoadKg: 0, maxTopPressureKgPerM2: 0, allowedOrientations: ['WLH'] })];
    const placed = [placement(), placement({ z: .5 }), placement({ x: 2, z: 1.3 })];
    const issues = auditLoading({ ...container, maxPayloadKg: 15, floorLoadLimitKgPerM2: 1 }, items, placed);
    const before = JSON.stringify([items, placed, issues]);
    expect(issues.length).toBeGreaterThan(8);
    for (const issue of issues) localized(issue.message, [id]);
    expect(JSON.stringify([items, placed, issues])).toBe(before);
  });

  it('localizes actual pallet-input rejection reasons without changing quantities', () => {
    const patches: Partial<PalletSpec>[] = [
      { length: 0 }, { tareWeightKg: -1 }, { maxLoadKg: 0 }, { maxStackLevels: .5 },
      { maxSupportedTopWeightKg: -1 }, { maxStaticLoadKg: -1 }, { cornerGuardWeightKg: -1 },
      { wrappingExtraHeightM: -1 }, { minTopLayerFillRatio: 1.1 },
    ];
    for (const patch of patches) {
      const result = packOnPallets(container, [cargo()], { ...defaultPalletSpec, ...patch });
      expect(result.placements).toHaveLength(0); expect(result.remaining[0].quantity).toBe(20);
      localized(result.remaining[0].reason);
    }
  });

  it('localizes nested built-in remaining reasons in engine-generated loading explanations', () => {
    const item = cargo({ maxStackLayers: 1, maxTopLoadKg: 0 });
    const result = loadContainer(container, [item], { strategy: 'capacity', publish: false });
    const before = JSON.stringify([item, result]);
    expect(result.remaining.length).toBeGreaterThan(0);
    const explanation = explainLoading(container, [item], result);
    for (const message of [...explanation.summary, ...explanation.cargo.flatMap(row => row.reasons)]) localized(message, [id]);
    expect(JSON.stringify([item, result])).toBe(before);
  });

  it('localizes all fixed physics-motion combinations without changing severities', () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const input = { outOfBounds: Boolean(mask & 1), horizontalShiftM: mask & 2 ? .047 : 0,
        verticalShiftM: mask & 4 ? -.083 : 0, tiltDeg: mask & 8 ? 5.7 : 0,
        linearSpeedMps: mask & 16 ? .06 : 0, angularSpeedRadps: 0 };
      const outcome = describePhysicsMotion(input); const before = JSON.stringify(outcome);
      localized(outcome.reason); expect(JSON.stringify(outcome)).toBe(before);
    }
  });

  it('localizes real physics scenario summaries and leaves physical results canonical', async () => {
    const suite = await runPhysicsValidationSuite(container, [placement()]);
    const falling = await runPhysicsValidation(container, [placement({ z: .8 })]);
    const before = JSON.stringify([suite, falling]);
    for (const message of [suite.summary, ...suite.scenarios.map(scenario => scenario.summary), falling.summary]) localized(message);
    expect(suite.scenarios.map(row => row.scenario)).toEqual(['settle', 'acceleration', 'braking', 'cornering']);
    expect(falling.unstableCount).toBe(1);
    expect(JSON.stringify([suite, falling])).toBe(before);
  }, 30_000);

  it('localizes generated zone labels, flow warnings and optimization profile labels', () => {
    const zones = assessZoneUtilization(container, [placement({ x: 1.4, height: 2 })]);
    for (const zone of zones) localized(zone.label);
    localized(detectZoneFlowWarning(zones)!);
    const result: LoadingResult = { placements: [placement()], remaining: [], validationIssues: [], loadedWeightKg: 10, usedVolumeM3: .5 };
    const profiles = buildDirectReoptimizationCargoProfiles({ mode: 'boxes', container, cargo: [cargo()], result });
    expect(profiles.length).toBeGreaterThan(2);
    for (const profile of profiles) localized(profile.label);
  });
});

it('only translates declared diagnostic slots and preserves unknown/user-owned text', () => {
  for (const locale of ['en', 'vi'] as const) {
    const reason = '컨테이너 최대 적재 중량 초과';
    expect(uiMessage(`미적재 3개: ${reason}`, locale)).toBe(uiText('미적재 {0}개: {1}', [3, uiMessage(reason, locale)], locale));
    for (const [template, values] of [
      ['원래 화물 입력 오류 ({0}): {1}', [id, reason]],
      ['{0} (필수 고정재 중량 {1}kg 포함)', [reason, '17.25']],
      ['최상단 최소충전율 {0}% 적용 후: {1}', ['50', reason]],
      ['WHAT-IF REVIEW 계산 차단: {0}', [reason]],
      ['A 규칙 최종 검사 실패: {0}', [reason]],
    ] as const) {
      const message = uiText(template, values, 'ko'); localized(message, [id]);
      expect(uiMessage(message, locale)).toContain(uiMessage(reason, locale));
    }
    const unknown = '사용자 진단: 주의 위험. $& [화물]';
    expect(uiMessage(unknown, locale)).toBe(unknown);
    expect(uiMessage(`미적재 3개: ${unknown}`, locale)).toContain(unknown);
    expect(uiMessage(`화물 ${id}의 등록 수량을 초과했습니다.`, locale)).toContain(id);
  }
});
