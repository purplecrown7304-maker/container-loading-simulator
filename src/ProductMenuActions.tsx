import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { openProductTool } from './productToolEvents';

function closeHeaderMenu() {
  const menu = document.querySelector<HTMLElement>('.final-workflow-menu');
  const button = document.querySelector<HTMLButtonElement>('.header-menu-button');
  if (menu && button) button.click();
}

export default function ProductMenuActions() {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = [...document.querySelectorAll('.final-workflow-menu > section')];
        const workPrep = sections.find(section => (section.querySelector('strong')?.textContent ?? '').includes('작업 준비')) ?? null;
        setTarget(workPrep);
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  if (!target) return null;
  return createPortal(<>
    <button type="button" onClick={() => { openProductTool('products'); closeHeaderMenu(); }}>
      <span>▦</span><div><b>회사 제품 관리</b><small>제품 등록 · Excel 업로드 · 제품별 자동 추천 박스 확인</small></div>
    </button>
    <button type="button" onClick={() => { openProductTool('cartons'); closeHeaderMenu(); }}>
      <span>▧</span><div><b>범용 · 추가 박스 추천</b><small>제품 전체와 보유 박스를 분석해 추가할 박스 스펙 추천 · 등록</small></div>
    </button>
  </>, target);
}
