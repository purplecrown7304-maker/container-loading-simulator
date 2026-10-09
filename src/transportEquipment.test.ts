import { describe, expect, it } from 'vitest';
import {
  CONTAINER_EQUIPMENT,
  TRUCK_EQUIPMENT,
  TRANSPORT_EQUIPMENT,
  createCustomEquipment,
  findMatchingEquipment,
  getTransportEquipment,
  selectTransportEquipment,
} from './transportEquipment';

describe('transport equipment catalog', () => {
  it('contains the requested container and truck families without duplicate ids', () => {
    expect(CONTAINER_EQUIPMENT.map(item => item.name)).toEqual(expect.arrayContaining([
      "20' STANDARD",
      "40' STANDARD",
      "40' HIGH-CUBE",
      "45' HIGH-CUBE",
      "20' OPEN TOP",
      "40' OPEN TOP",
      "20' FLATRACK",
      "40' FLATRACK",
      "20' FLATRACK COLLAPSIBLE",
      "40' FLATRACK COLLAPSIBLE",
      "20' PLATFORM",
      "40' PLATFORM",
      "20' REFRIGERATED",
      "40' REFRIGERATED",
      "20' BULK",
      "20' TANK",
      'CUSTOM CONTAINER',
    ]));
    expect(TRUCK_EQUIPMENT.map(item => item.name)).toEqual(expect.arrayContaining([
      '1톤 내장탑차',
      '2.5톤 윙바디',
      '2.5톤급 내장탑 (허용 2.4톤)',
      '5톤급 윙바디 (허용 5.5톤)',
      '7톤 후2축 윙바디',
      '대형 윙바디 · 실차 등록',
    ]));
    expect(new Set(TRANSPORT_EQUIPMENT.map(item => item.id)).size).toBe(TRANSPORT_EQUIPMENT.length);
  });

  it('matches a known preset from dashboard dimensions', () => {
    const match = findMatchingEquipment(12.032, 2.35, 2.7, 28600);
    expect(match?.id).toBe('40-high-cube');
  });

  it('keeps custom truck values exactly', () => {
    const custom = createCustomEquipment('truck', {
      length: 9.7,
      width: 2.44,
      height: 2.55,
      maxPayloadKg: 14500,
      floorLoadLimitKgPerM2: 1650,
    });
    expect(custom).toMatchObject({ id: 'custom-truck', category: 'truck', length: 9.7, width: 2.44, height: 2.55, maxPayloadKg: 14500, floorLoadLimitKgPerM2: 1650 });
  });

  it('marks tank and bulk equipment as specialized cargo', () => {
    expect(CONTAINER_EQUIPMENT.find(item => item.id === '20-tank')?.specializedCargo).toBe(true);
    expect(CONTAINER_EQUIPMENT.find(item => item.id === '20-bulk')?.specializedCargo).toBe(true);
  });

  it('uses completed-body inner dimensions and cargo payload, not GVW or cargo side-board height', () => {
    const expected = {
      'kr-1t-box': [2.83, 1.67, 1.58, 1000], 'kr-2.5t-wing': [5, 2.15, 2.015, 2500],
      'kr-2.4t-box': [4.33, 1.96, 1.85, 2400], 'kr-5.5t-wing': [7.82, 2.4, 2.56, 5500], 'kr-7t-wing': [9.2, 2.4, 2.6, 7000],
    };
    for (const [id, spec] of Object.entries(expected)) {
      const e = getTransportEquipment(id)!;
      expect([e.length, e.width, e.height, e.maxPayloadKg], id).toEqual(spec);
      expect(e.sourceUrl).toContain('hyundai.com/');
      expect(e.note).toContain('임시 유도값');
      expect(e.volumeM3).toBeCloseTo(e.length * e.width * e.height);
    }
    expect(TRUCK_EQUIPMENT.some(e => e.id === 'tautliner')).toBe(false);
    expect(getTransportEquipment('tautliner')).toMatchObject({ length: 13.62, maxPayloadKg: 32800 });
  });

  it('requires actual payload and floor ratings before selecting the large-body reference', () => {
    const large = getTransportEquipment('custom-heavy-truck')!;
    expect(large.requiresSpecification).toBe(true);
    expect(large.maxPayloadKg).toBe(0);
    expect(() => selectTransportEquipment(large)).toThrow('실차');
  });
});

describe('owner decisions 2026-10-08 on equipment values', () => {
  it('lets every general-cargo preset carry its nameplate payload when spread evenly over the floor', async () => {
    const { TRANSPORT_EQUIPMENT } = await import('./transportEquipment');
    for (const item of TRANSPORT_EQUIPMENT.filter(e => !e.specializedCargo)) {
      const evenlySpreadKg = item.floorLoadLimitKgPerM2 * item.length * item.width;
      expect(evenlySpreadKg, item.id).toBeGreaterThanOrEqual(item.maxPayloadKg);
    }
  });

  it('keeps the derived 20 ft floor limits at payload ÷ floor area rounded up to 10 kg/m²', async () => {
    const { TRANSPORT_EQUIPMENT } = await import('./transportEquipment');
    const derived = { '20-standard': 2030, '20-open-top': 2170, '20-flatrack': 3070, '20-flatrack-collapsible': 2860, '20-platform': 2860, '20-reefer': 2350 };
    for (const [id, limit] of Object.entries(derived)) {
      const item = TRANSPORT_EQUIPMENT.find(e => e.id === id)!;
      expect(item.floorLoadLimitKgPerM2, id).toBe(limit);
      expect(Math.ceil(item.maxPayloadKg / (item.length * item.width) / 10) * 10, id).toBe(limit);
    }
    // 40 ft class already reached payload at 1,500 kg/m² and is unchanged.
    expect(TRANSPORT_EQUIPMENT.find(e => e.id === '40-standard')!.floorLoadLimitKgPerM2).toBe(1500);
    expect(TRANSPORT_EQUIPMENT.find(e => e.id === '40-high-cube')!.floorLoadLimitKgPerM2).toBe(1500);
  });

  it('uses one payload source for both rulesets: 40 ft standard is 28,750 kg', async () => {
    const { TRANSPORT_EQUIPMENT } = await import('./transportEquipment');
    const { CONTAINERS } = await import('./engine/loadSimA/presets');
    const pairs = { '20-standard': '20GP', '40-standard': '40GP', '40-high-cube': '40HC', '45-high-cube': '45HC' };
    for (const [legacyId, aId] of Object.entries(pairs)) {
      expect(CONTAINERS[aId].maxPayload, aId).toBe(TRANSPORT_EQUIPMENT.find(e => e.id === legacyId)!.maxPayloadKg);
    }
    expect(CONTAINERS['40GP'].maxPayload).toBe(28750);
  });
});
