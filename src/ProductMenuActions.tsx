import { useEffect } from 'react';
import { openProductTool } from './productToolEvents';
import { openTransportEquipmentSpecManager } from './TransportEquipmentSpecManager';

function closeHeaderMenu() {
  const menu = document.querySelector<HTMLElement>('.final-workflow-menu');
  const button = document.querySelector<HTMLButtonElement>('.header-menu-button');
  if (menu && button) button.click();
}

function buttonTitle(button: Element) {
  return (button.querySelector('b')?.textContent ?? '').trim();
}

function setButtonCopy(button: HTMLButtonElement | null, title: string, description: string) {
  if (!button) return;
  const titleNode = button.querySelector('b');
  const descriptionNode = button.querySelector('small');
  if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
  if (descriptionNode && descriptionNode.textContent !== description) descriptionNode.textContent = description;
}

function createMenuButton(className: string, icon: string, title: string, description: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  const iconNode = document.createElement('span');
  iconNode.textContent = icon;
  const copy = document.createElement('div');
  const titleNode = document.createElement('b');
  titleNode.textContent = title;
  const descriptionNode = document.createElement('small');
  descriptionNode.textContent = description;
  copy.append(titleNode, descriptionNode);
  button.append(iconNode, copy);
  button.addEventListener('click', onClick);
  return button;
}

function syncWorkPreparationMenu() {
  const sections = [...document.querySelectorAll<HTMLElement>('.final-workflow-menu > section')];
  const workPrep = sections.find(section => (section.querySelector('strong')?.textContent ?? '').includes('작업 준비'));
  if (!workPrep) return;

  const directButtons = [...workPrep.querySelectorAll<HTMLButtonElement>(':scope > button')];
  const equipmentButton = directButtons.find(button => ['컨테이너 · 차량 선택', '적재공간'].includes(buttonTitle(button))) ?? null;
  const boxButton = directButtons.find(button => ['박스 · 화물 선택', '박스 관리'].includes(buttonTitle(button))) ?? null;

  setButtonCopy(equipmentButton, '적재공간', '현재 작업에 사용할 컨테이너·트럭 적재공간 선택');
  setButtonCopy(boxButton, '박스 관리', '등록 박스 조회 · 신규 등록 · Excel 업로드 · 적재 투입');

  workPrep.querySelectorAll<HTMLButtonElement>(':scope > button').forEach(button => {
    if (buttonTitle(button).includes('범용 · 추가 박스')) button.remove();
  });

  let companyButton = workPrep.querySelector<HTMLButtonElement>(':scope > .product-menu-company-action');
  if (!companyButton) {
    companyButton = createMenuButton(
      'product-menu-company-action',
      '▦',
      '회사 제품 관리',
      '제품 등록 · Excel 업로드 · 제품 마스터 관리',
      () => { openProductTool('products'); closeHeaderMenu(); },
    );
  }

  if (boxButton) {
    if (companyButton.parentElement !== workPrep || companyButton.nextElementSibling !== boxButton) workPrep.insertBefore(companyButton, boxButton);
  } else if (companyButton.parentElement !== workPrep) {
    workPrep.appendChild(companyButton);
  }
}

function syncBoxManagement() {
  const modal = document.querySelector<HTMLElement>('.workspace-modal.box-selector-modal');
  if (!modal) return;
  const title = modal.querySelector<HTMLElement>('header > b');
  if (title && title.textContent !== '박스 관리') title.textContent = '박스 관리';

  const actionGroup = modal.querySelector<HTMLElement>('.box-selector-actions > div');
  if (!actionGroup) return;
  let recommendationButton = actionGroup.querySelector<HTMLButtonElement>('.box-common-recommendation-action');
  if (!recommendationButton) {
    recommendationButton = document.createElement('button');
    recommendationButton.type = 'button';
    recommendationButton.className = 'box-common-recommendation-action';
    recommendationButton.textContent = '범용 · 추가 박스 추천';
    recommendationButton.addEventListener('click', () => openProductTool('cartons'));
    actionGroup.appendChild(recommendationButton);
  }
}

function syncVehicleSpecManagement() {
  const sections = [...document.querySelectorAll<HTMLElement>('.final-workflow-menu > section')];
  for (const section of sections) {
    const button = [...section.querySelectorAll<HTMLButtonElement>(':scope > button')]
      .find(item => buttonTitle(item) === '차량 규격 관리');
    if (!button) continue;
    setButtonCopy(button, '차량 규격 관리', '적재공간에 등록된 컨테이너·트럭의 실제 계산 규격 수정');
    if (button.dataset.transportSpecManagerBound === 'true') return;
    button.dataset.transportSpecManagerBound = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openTransportEquipmentSpecManager();
      closeHeaderMenu();
    }, true);
    return;
  }
}

export default function ProductMenuActions() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        syncWorkPreparationMenu();
        syncBoxManagement();
        syncVehicleSpecManagement();
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.querySelectorAll('.product-menu-company-action,.box-common-recommendation-action').forEach(node => node.remove());
    };
  }, []);

  return null;
}
