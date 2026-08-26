import { describe, expect, it } from 'vitest';
import { buildTransportShell } from './transportShell';
import type { ContainerSpec } from './types';

const base: ContainerSpec = { length: 13.6, width: 2.5, height: 2.65, maxPayloadKg: 25000 };

describe('buildTransportShell', () => {
  it('keeps legacy container data as a rigid six-face shell', () => {
    const shell = buildTransportShell(base);
    expect(shell.roof).toBe(true);
    expect(shell.leftWall).toBe(true);
    expect(shell.rightWall).toBe(true);
    expect(shell.frontWall).toBe(true);
    expect(shell.rearWall).toBe(true);
  });

  it('does not treat curtainsider sides and soft roof as cargo-support walls', () => {
    const shell = buildTransportShell({
      ...base,
      transportKind: 'truck',
      transportType: 'tautliner',
      sideWallModel: 'curtain',
      roofModel: 'soft',
    });
    expect(shell.roof).toBe(false);
    expect(shell.leftWall).toBe(false);
    expect(shell.rightWall).toBe(false);
    expect(shell.frontWall).toBe(true);
    expect(shell.rearWall).toBe(true);
  });

  it('keeps refrigerated truck walls rigid', () => {
    const shell = buildTransportShell({
      ...base,
      transportKind: 'truck',
      transportType: 'refrigerated-truck',
      sideWallModel: 'rigid',
      roofModel: 'rigid',
    });
    expect(shell.roof).toBe(true);
    expect(shell.leftWall).toBe(true);
    expect(shell.rightWall).toBe(true);
  });
});
