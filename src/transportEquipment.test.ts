import { describe, expect, it } from 'vitest';
import {
  CONTAINER_EQUIPMENT,
  TRUCK_EQUIPMENT,
  TRANSPORT_EQUIPMENT,
  createCustomEquipment,
  findMatchingEquipment,
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
      'TAUTLINER (CURTAINSIDER)',
      'REFRIGERATED TRUCK',
      'ISOTHERM TRUCK',
      'MEGA-TRAILER',
      'JUMBO',
      'CUSTOM TRUCK',
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
});
