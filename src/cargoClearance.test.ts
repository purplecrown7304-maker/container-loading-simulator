import { describe, expect, it } from 'vitest';
import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { selectedCargoClearance, clearanceNumber, clearanceFaceLabel, equipmentRearAccess } from './cargoClearance';
import { sceneCameraPose, sceneCenter, type ThreeComparisonPlan } from './threeComparisonSceneState';
import { viewerPlan } from './viewerSceneProtocol';
import { getTransportEquipment } from './transportEquipment';
import { uiText } from './uiLanguage';

const container = { length: 6, width: 2.4, height: 2.6, maxPayloadKg: 1000 };
const body = { cargoId: 'A', x: 1, y: .3, z: .2, length: 2, width: .5, height: .7, weightKg: 10, rotated: true };
const plan: ThreeComparisonPlan = viewerPlan(container, { placements: [body], remaining: [], validationIssues: [], usedVolumeM3: .7, loadedWeightKg: 10 }, 1, [], {
  supports: [{ id: 'PALLET-1', x: 1, y: .2, z: 0, length: 1.2, width: 1, height: .15, weightKg: 20 }],
});
const measured = (selection: {kind:'cargo'|'support';index:number} = { kind: 'cargo', index: 0 }) => selectedCargoClearance(plan, selection)!;
const distances = (value = measured()) => Object.fromEntries(value.measurements.map(m => [m.face, m.distanceM]));

describe('selected object to loading-space boundary measurements', () => {
  it('uses oriented physical dimensions without swapping twice or applying renderer inset', () => {
    const before = JSON.stringify(plan);
    const expected = { inner: 1, rear: 3, left: 1.6, right: .3, top: 1.7, bottom: .2 };
    for (const [face, value] of Object.entries(expected)) expect(distances()[face]).toBeCloseTo(value);
    expect(measured().measurements).toHaveLength(6);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('measures actual rotated replay AABBs with all three quaternion axes', () => {
    for (const rotation of [[0, Math.PI / 2, 0], [.31, .27, .59]]) {
      const q = new Quaternion().setFromEuler(new Euler(...rotation as [number, number, number]));
      const center = new Vector3(...sceneCenter(body, container));
      const frame = { cargo: new Float32Array([...center.toArray(), ...q.toArray()]), supports: new Float32Array(), step: 1, phase: 'force' as const };
      const result = selectedCargoClearance(plan, { kind: 'cargo', index: 0 }, frame)!;
      const q32 = new Quaternion(...Array.from(frame.cargo.slice(3)) as [number, number, number, number]).normalize();
      const points = [-1,1].flatMap(x => [-1,1].flatMap(y => [-1,1].map(z => new Vector3(x*body.length/2,y*body.height/2,z*body.width/2).applyQuaternion(q32).add(new Vector3(...Array.from(frame.cargo.slice(0,3)) as [number,number,number])))));
      const values = distances(result);
      expect(values.inner).toBeCloseTo(Math.min(...points.map(p=>p.x))+3);
      expect(values.rear).toBeCloseTo(3-Math.max(...points.map(p=>p.x)));
      expect(values.left).toBeCloseTo(1.2-Math.max(...points.map(p=>p.z)));
      expect(values.right).toBeCloseTo(Math.min(...points.map(p=>p.z))+1.2);
      expect(values.top).toBeCloseTo(2.6-Math.max(...points.map(p=>p.y)));
      expect(values.bottom).toBeCloseTo(Math.min(...points.map(p=>p.y)));
    }
  });
  it('measures the selected pallet base and retains floor contact and negative overflow', () => {
    expect(distances(measured({ kind: 'support', index: 0 })).bottom).toBe(0);
    const outside = {...plan, placements:[{...plan.placements[0],x:-.1,y:2,z:-.02}]};
    const values = distances(selectedCargoClearance(outside, {kind:'cargo',index:0})!);
    expect(values.inner).toBeCloseTo(-.1); expect(values.left).toBeCloseTo(-.1); expect(values.bottom).toBeCloseTo(-.02);
    expect(clearanceNumber(-.1)).toBe('−100 mm'); expect(clearanceNumber(-.00001)).toBe('−<0.1 mm'); expect(clearanceNumber(0)).toBe('0 mm');
  });
  it('labels left/right by the actual rear camera projection', () => {
    const pose = sceneCameraPose(plan,'door',1.5), camera = new PerspectiveCamera(40,1.5,.02,500);
    camera.position.copy(pose.position); camera.lookAt(pose.target); camera.updateMatrixWorld(true);
    expect(camera.position.x).toBeGreaterThan(container.length/2);
    const left = measured().measurements.find(m=>m.face==='left')!, right = measured().measurements.find(m=>m.face==='right')!;
    expect(new Vector3(...left.to).project(camera).x).toBeLessThan(new Vector3(...right.to).project(camera).x);
  });
  it('clears invalid selections and never derives a gap from other cargo or a zero inset', () => {
    for (const selection of [null,{kind:'cargo' as const,index:-1},{kind:'cargo' as const,index:10},{kind:'support' as const,index:1},{kind:'cargo' as const,index:.5}]) expect(selectedCargoClearance(plan,selection)).toBeNull();
    expect(selectedCargoClearance({...plan,placements:[plan.placements[0],{...plan.placements[0],x:3}]},{kind:'cargo',index:0})).toEqual(measured());
  });
  it('uses actual door metadata and does not claim doors for open equipment', () => {
    expect(equipmentRearAccess(getTransportEquipment('40-high-cube')!)).toBe('door');
    expect(equipmentRearAccess(getTransportEquipment('kr-1t-box')!)).toBe('door');
    for (const id of ['20-flatrack','40-platform','20-tank','custom-container']) expect(equipmentRearAccess(getTransportEquipment(id)!)).toBe('rear');
    expect(equipmentRearAccess({geometry:'curtain',doorWidth:0,doorHeight:2})).toBe('rear');
  });
  it.each(['en','vi'] as const)('localizes every measurement and caveat in %s', language => {
    const keys = [...measured().measurements.map(m=>clearanceFaceLabel(m.face,'door')),clearanceFaceLabel('rear','rear'),'문','후면 기준','경계 초과','선택 해제','팔레트 받침','적재 공간 경계까지 거리','치수선 표시 방향','좌우는 후면에서 안쪽을 보는 기준입니다.','선택물 외곽부터 공간 경계까지의 직선 거리입니다. 사이에 다른 화물·지지대가 있을 수 있으며, 통로 폭이나 안전 판정이 아닙니다.','팔레트 받침 자체 기준 · 위에 실린 상자는 별도 선택'];
    for (const key of keys) expect(uiText(key,[],language)).not.toMatch(/[가-힣]/);
  });
});
