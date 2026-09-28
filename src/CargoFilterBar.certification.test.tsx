import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import CargoFilterBar from './CargoFilterBar';
import CertificationInvalidationBridge from './CertificationInvalidationBridge';
import { clearLatestInertiaCertification } from './inertiaCertification';
import { clearPhysicsTarget } from './physicsTarget';
vi.mock('./inertiaCertification',()=>({clearLatestInertiaCertification:vi.fn()}));
vi.mock('./physicsTarget',()=>({clearPhysicsTarget:vi.fn(),PHYSICS_TARGET_EVENT:'synthetic-target'}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.clearAllMocks();});
it('cargo search keeps completed verification while physical input edits still invalidate it',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<><CertificationInvalidationBridge/><CargoFilterBar/><input aria-label="Actual cargo weight" type="number"/></>));
  const search=host.querySelector<HTMLInputElement>('[aria-label="품목 코드 또는 품명 검색"]')!;
  await act(async()=>{search.value='synthetic';search.dispatchEvent(new Event('input',{bubbles:true}));search.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(clearLatestInertiaCertification).not.toHaveBeenCalled();expect(clearPhysicsTarget).not.toHaveBeenCalled();
  const weight=host.querySelector<HTMLInputElement>('[aria-label="Actual cargo weight"]')!;
  await act(async()=>{weight.value='20';weight.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(clearLatestInertiaCertification).toHaveBeenCalledOnce();expect(clearPhysicsTarget).toHaveBeenCalledOnce();
 }finally{await act(async()=>root.unmount());host.remove();}
});
