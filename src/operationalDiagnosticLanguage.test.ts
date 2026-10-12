import { describe, expect, it } from 'vitest';
import { validateOperationalLoading, validateOperationalWeightAndCog } from './engine/operationalValidator';
import { palletAdvisoryFindings } from './engine/palletPlanValidation';
import type { PalletLoad } from './engine/palletPacking';
import type { CargoItem, ContainerSpec, OperationalRuleFinding, Placement } from './engine/types';
import { uiMessage, uiText } from './uiLanguage';
import { uiMessages } from './uiMessages';
import { uiMessagesInspection } from './uiMessagesInspection';

const container: ContainerSpec = { length: 4, width: 2, height: 2, maxPayloadKg: 1000 };
const cargo = (id: string, patch: Partial<CargoItem> = {}): CargoItem => ({
  id, name: id, length: 1, width: 1, height: .5, weightKg: 100, quantity: 10,
  maxTopLoadKg: 500, maxStackLayers: 5, allowRotation: true, ...patch,
});
const box = (cargoId: string, patch: Partial<Placement> = {}): Placement => ({
  cargoId, x: 1.5, y: .5, z: 0, length: 1, width: 1, height: .5, weightKg: 100, ...patch,
});

// These are deliberately real Korean catalog keys used as user-owned IDs/classes/zones.
const names = ['위험', '주의', '화물', '출발', '안정', '미실행', '팔레트'] as const;
function expectLocalized(findings: OperationalRuleFinding[], locale: 'en' | 'vi') {
  expect(findings.length).toBeGreaterThan(0);
  const snapshot = JSON.stringify(findings);
  for (const finding of findings) {
    const translated = uiMessage(finding.message, locale);
    expect(translated, finding.message).not.toBe(finding.message);
    expect(uiMessage(finding.message, 'ko')).toBe(finding.message);
    const withoutUserNames = names.reduce((text, name) => text.replaceAll(name, ''), translated);
    expect(withoutUserNames, finding.message).not.toMatch(/[가-힣]/);
    expect(translated, finding.message).not.toMatch(/\{\d+\}/);
    // Display translation must neither drop nor round any engine-generated metric.
    expect(translated.match(/[+-]?\d+(?:\.\d+)?/g)?.sort() ?? [])
      .toEqual(finding.message.match(/[+-]?\d+(?:\.\d+)?/g)?.sort() ?? []);
  }
  expect(JSON.stringify(findings)).toBe(snapshot);
}

function generatedFindings() {
  const findings: OperationalRuleFinding[] = [];
  const add = (items: CargoItem[], placements: Placement[], space = container) =>
    findings.push(...validateOperationalLoading(space, items, placements));
  add([cargo('위험'), cargo('주의')], [box('위험', { x: -.1 }), box('주의', { x: 0 })]);
  add([cargo('위험')], [box('위험', { height: 2.65, x: 5.5, y: .675 })],
    { length: 12.032, width: 2.35, height: 2.7, maxPayloadKg: 28600 });
  add([cargo('위험'), cargo('주의')], [box('위험', { length: .413 }), box('주의', { z: .5 })]);
  add([cargo('출발')], [box('출발', { z: 1.2 })]);
  // Overlapping supports also trigger the support-envelope branch. The validator must
  // disclose both independent failures, even for an already-invalid geometry fixture.
  add([cargo('위험'), cargo('주의')], [box('위험', { length: .4 }), box('위험', { length: .4 }), box('주의', { z: .5 })]);
  add([cargo('위험', { maxStackLayers: 1, maxTopLoadKg: 10, maxTopPressureKgPerM2: 1 }),
    cargo('주의', { maxTopLoadKg: 0 }), cargo('출발')],
  [box('위험', { weightKg: 10 }), box('주의', { z: .5, weightKg: 20 }), box('출발', { z: 1 })]);
  add([cargo('위험')], [box('위험', { weightKg: 1001 })]);
  add([cargo('위험')], [box('위험', { x: 0, y: 0 })]);
  add([cargo('위험')], [box('위험', { x: 3, y: 1 })]);
  add([cargo('위험')], [box('위험', { width: .2, height: 2 })]);
  add([cargo('위험')], [box('위험', { length: .2, height: 1.5 })]);
  add([cargo('위험', { segregationClass: '안정', tempZone: '미실행' }),
    cargo('주의', { segregationClass: '화물', tempZone: '팔레트' })],
  [box('위험'), box('주의', { x: 2.5 })], { ...container, incompatiblePairs: [['안정', '화물']] });
  return findings;
}

function afterStopFindings(unloadingPolicy: 'strict' | 'soft') {
  const space = { ...container, unloadingPolicy };
  const items = [cargo('위험', { unloadPriority: 1 }), cargo('주의', { unloadPriority: 2 }), cargo('출발', { unloadPriority: 2 })];
  const floating = validateOperationalLoading(space, items,
    [box('위험'), box('주의', { z: .5 }), box('출발', { x: 2.5 })]);
  const insufficient = validateOperationalLoading(space, items,
    [box('위험', { length: .6 }), box('주의', { x: 2.1, length: .4 }), box('출발', { z: .5 })]);
  const outsideSupport = validateOperationalLoading(space, items,
    [box('주의', { length: .4 }), box('주의', { length: .4 }),
      box('위험', { x: 1.9, length: .6 }), box('출발', { z: .5 })]);
  return [...floating, ...insufficient, ...outsideSupport];
}

describe('regular operational diagnostic presentation', () => {
  it.each(['en', 'vi'] as const)('localizes every generated regular finding in %s without changing canonical findings', locale => {
    const findings = generatedFindings();
    expect(new Set(findings.map(finding => finding.code))).toEqual(new Set([
      'OUT_OF_BOUNDS', 'OVERLAP', 'DOOR_NOT_PASSABLE', 'INSUFFICIENT_SUPPORT', 'FLOATING',
      'CG_OUTSIDE_SUPPORT', 'STACK_LIMIT', 'TOP_LOAD_EXCEEDED', 'NO_STACK_ON_TOP', 'TOP_PRESSURE_LIMIT',
      'PAYLOAD_EXCEEDED', 'CG_LONGITUDINAL', 'CG_LATERAL', 'CG_HIGH', 'REAR_GAP', 'TIPPING_RISK',
      'SECURING_FORCE', 'HALF_WEIGHT_CONCENTRATION', 'INCOMPATIBLE_CARGO', 'MIXED_TEMP_ZONE', 'HEAVY_ON_LIGHT',
    ]));
    expectLocalized(findings, locale);
    expect(findings.some(finding => finding.message.includes('지지율 41.3%'))).toBe(true);
    for (const direction of ['안쪽', '문 쪽', '좌측', '우측']) {
      expect(findings.some(finding => finding.message.startsWith(`${direction} 절반`))).toBe(true);
    }
    for (const direction of ['측방', '전방']) {
      expect(findings.some(finding => finding.message.includes(`${direction} 전도 위험`))).toBe(true);
    }
  });

  it.each(['strict', 'soft'] as const)('localizes full %s unloading and after-stop composites without changing severity', unloadingPolicy => {
    const findings = afterStopFindings(unloadingPolicy);
    const affected = findings.filter(finding => /^(UNLOAD_|AFTER_STOP_)/.test(finding.code));
    expect(new Set(affected.map(finding => finding.code))).toEqual(new Set([
      'UNLOAD_BLOCKED', 'UNLOAD_BLOCKED_ABOVE', 'AFTER_STOP_FLOATING',
      'AFTER_STOP_INSUFFICIENT_SUPPORT', 'AFTER_STOP_CG_OUTSIDE_SUPPORT',
    ]));
    expect(affected.every(finding => finding.severity === (unloadingPolicy === 'soft' ? 'warning' : 'error'))).toBe(true);
    for (const locale of ['en', 'vi'] as const) {
      expectLocalized(findings, locale);
      for (const finding of affected) {
        const translated = uiMessage(finding.message, locale);
        if (finding.code.startsWith('AFTER_STOP_')) expect(translated).toMatch(locale === 'en' ? /^After unloading stop 1:/ : /^Sau khi dỡ xong điểm 1:/);
        expect(translated.includes(locale === 'en' ? 'Relaxed mode:' : 'Chế độ nới lỏng:')).toBe(unloadingPolicy === 'soft');
      }
    }
  });

  it('preserves the proportional CG verdict, values, units and Korean originals', () => {
    const space = { ...container, length: 4.4, maxPayloadKg: 100 };
    const placements = [box('위험', { x: 0, y: 0, weightKg: 100 })];
    const snapshot = JSON.stringify([space, placements]);
    const findings = validateOperationalWeightAndCog(space, placements);
    expect(findings.find(finding => finding.code === 'CG_LONGITUDINAL')?.message)
      .toBe('길이 방향 무게중심 편차 1700mm가 허용 ±220mm를 넘습니다.');
    expect(uiMessage(findings[0].message, 'en'))
      .toBe('Longitudinal center-of-gravity deviation 1700mm exceeds the permitted ±220mm.');
    expectLocalized(findings, 'en'); expectLocalized(findings, 'vi');
    expect(validateOperationalWeightAndCog(space, placements)).toEqual(findings);
    expect(JSON.stringify([space, placements])).toBe(snapshot);
  });

  it.each(['en', 'vi'] as const)('preserves opaque IDs, classes and temperature names in %s', locale => {
    const id = '주의 위험: 출발 $& {9} <사용자 이름>';
    const key = '{0}: 지지율 {1}%로 기준 {2}% 미만입니다.';
    expect(uiMessage(`${id}: 지지율 41.3%로 기준 80% 미만입니다.`, locale))
      .toBe(uiText(key, [id, '41.3', '80'], locale));
    const otherId = '안정 [미실행]';
    expect(uiMessage(`${id}와 ${otherId}가 겹칩니다.`, locale))
      .toBe(uiText('{0}와 {1}가 겹칩니다.', [id, otherId], locale));
    const mixed = generatedFindings().filter(finding => ['INCOMPATIBLE_CARGO', 'MIXED_TEMP_ZONE', 'HEAVY_ON_LIGHT'].includes(finding.code));
    expect(mixed).toHaveLength(4);
    for (const finding of mixed) {
      const translated = uiMessage(finding.message, locale);
      const expectedNames = finding.code === 'INCOMPATIBLE_CARGO' ? ['안정', '화물']
        : finding.code === 'MIXED_TEMP_ZONE' ? ['미실행', '팔레트']
          : finding.message.startsWith('주의') ? ['주의', '위험'] : ['출발', '주의'];
      for (const name of expectedNames) expect(translated).toContain(name);
    }
  });

  it.each(['en', 'vi'] as const)('keeps unrecognized diagnostics verbatim in %s', locale => {
    for (const unknown of ['사용자 진단: 위험 여부를 현장에서 확인', '지지율 결과는 사용자 검토 필요',
      '하역 순서 1 완료 후: 사용자 진단 유지', '사용자 진단 완화 모드: 현장 재취급이 필요합니다.']) {
      expect(uiMessage(unknown, locale)).toBe(unknown);
    }
  });

  it('keeps every inspection placeholder contract and the effective operational catalog intact', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
    for (const [key, translations] of Object.entries(uiMessagesInspection)) {
      for (const translation of translations) expect(placeholders(translation), key).toEqual(placeholders(key));
    }
    const keys = Object.keys(uiMessagesInspection);
    const operationalKeys = keys.slice(keys.indexOf('{0}: 적재 공간 경계를 벗어났습니다.'));
    expect(operationalKeys).toHaveLength(35);
    for (const key of operationalKeys) {
      expect(uiMessages[key], key).toEqual(uiMessagesInspection[key]);
      const values = Array.from({ length: 4 }, (_, index) => `opaque-${index}-주의`);
      for (const locale of ['en', 'vi'] as const) {
        const korean = uiText(key, values, 'ko');
        expect(uiMessage(korean, locale), key).toBe(uiText(key, values, locale));
      }
    }
  });

  it('supports saved legacy securing labels as well as current labels', () => {
    for (const key of ['2차 보강 · 밴딩+각대+랩핑', '2차 보강 · 강화 밴딩+각대+랩핑']) {
      expect(uiMessage(key, 'ko')).toBe(key);
      for (const locale of ['en', 'vi'] as const) {
        expect(uiMessage(key, locale)).toBe(uiMessagesInspection[key][locale === 'en' ? 0 : 1]);
        expect(uiMessage(key, locale)).not.toMatch(/[가-힣]/);
      }
    }
  });

  it.each(['en', 'vi'] as const)('localizes all pallet advisories in %s, preserving warning severity and 19/90/72 values', locale => {
    for (const [transport, stacked, reason] of [
      ['export', true, '수출·2단 적재'], ['export', false, '수출'], ['domestic', true, '2단 적재'],
    ] as const) {
      const space: Pick<ContainerSpec, 'palletDestination'> = {
        palletDestination: { transport, region: 'asia', requiredSize: '' },
      };
      const pallets: PalletLoad[] = Array.from({ length: 19 }, (_, index) => {
        const upper = stacked && index === 18;
        const stackColumn = upper ? 17 : index;
        const x = stackColumn * 1.1; const z = upper ? .8 : 0;
        return {
          palletIndex: index + 1, x, y: 0, z, stackColumn, stackLevel: upper ? 2 : 1,
          length: 1, width: 1, height: .15,
          cargoPlacements: [box('위험', { x, y: 0, z: z + .15, length: .8, width: .9 })],
          cargoWeightKg: 100, packagingWeightKg: 0, packagingExtraHeightM: 0,
          cornerGuardsUsed: false, wrappingUsed: false, totalWeightKg: 125,
          centerOfGravity: { x: x + .5, y: .5, z: z + .4 },
        };
      });
      const snapshot = JSON.stringify([space, pallets]);
      const findings = palletAdvisoryFindings(space, { pallets });
      expect(findings.map(finding => finding.code)).toEqual(['PALLET_DECK_COVERAGE', 'WRAP_RECOMMENDED']);
      expect(findings.every(finding => finding.severity === 'warning')).toBe(true);
      expect(findings[0].value).toBeCloseTo(.72);
      expect(findings[0].limit).toBe(.9);
      expect(findings[0].message).toContain('파렛트 19개');
      expect(findings[0].message).toContain('90% 미만');
      expect(findings[0].message).toContain('최저 72%');
      expect(findings[1].message.startsWith(`${reason}인데`)).toBe(true);
      expect(findings[1].value).toBe(transport === 'export' ? 19 : 2);
      expectLocalized(findings, locale);
      expect(uiMessage(findings[0].message, locale)).toContain('19');
      expect(uiMessage(findings[0].message, locale)).toContain('90%');
      expect(uiMessage(findings[0].message, locale)).toContain('72%');
      expect(JSON.stringify([space, pallets])).toBe(snapshot);
      expect(palletAdvisoryFindings(space, { pallets })).toEqual(findings);
    }
  });
});
