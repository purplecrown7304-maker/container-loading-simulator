/**
 * LOADING_RULES R-10. Field checks the simulator cannot calculate: equipment condition,
 * securing work, seal and photo records. Static, printed as blank boxes for the worker;
 * it never states that a check was done and never changes approval or PASS.
 * Wording uses shop-floor terms (대표 결정 2026-10-08); edit the strings here to match a site.
 */
export type FieldChecklistGroup = { title: string; items: string[] };
export type FieldChecklistOptions = { pallet?: boolean };

export function fieldChecklistGroups(category: 'container' | 'truck', options: FieldChecklistOptions = {}): FieldChecklistGroup[] {
  const container = category === 'container';
  const unit = options.pallet ? '팔레트' : '박스';
  return [
    {
      title: '상차 전',
      items: [
        '출고 서류와 실물 검수 (품명·수량·중량)',
        container ? '컨테이너 번호가 배차 서류와 일치' : '차량 번호·적재중량이 배차 서류와 일치',
        container ? '공컨테이너 점검: 도어를 닫고 빛샘 확인 (벽·지붕·바닥·도어 패킹)' : '적재함 바닥·문짝·래싱 고리 손상 없음',
        '내부 청소·건조 상태, 냄새·못·돌출물 없음',
        options.pallet ? '팔레트 파손·젖음·오버행 없음, 랩핑·밴딩 상태 확인' : '박스 파손·젖음 없음',
        ...(options.pallet ? ['수출 목재 팔레트는 열처리(HT) 마크 확인'] : []),
        '래싱벨트·각대·에어백 등 고정 자재 수량과 상태 확인',
        '고임목 설치, 지게차 작업 반경에 사람 없음',
      ],
    },
    {
      title: '상차 중',
      items: [
        '작업지시서 순서대로, 안쪽 벽과 좌우 벽에 밀착',
        '중량물은 아래, 취급 표시(천지무용·단수 제한) 준수',
        `${unit} 사이와 벽 쪽 빈 공간에 지시된 메움재(에어백·허니콤) 설치`,
        '절반 상차 시점에 사진 촬영',
      ],
    },
    {
      title: '상차 후',
      items: [
        '도어 쪽 마감(쇼링·고정바) 확인',
        '래싱벨트 장력과 각대 확인',
        '만재 상태와 도어를 닫은 상태 사진 촬영',
        container ? '씰 체결, 씰 번호 기록' : '덮개(호루) 또는 결박으로 낙하 방지',
        container ? '수출 화물이면 VGM(검증 총중량) 제출' : '적재 높이·폭·길이가 도로 운행 한도 이내',
        '기사에게 화물 특성·중량·하차 순서·재조임 지점 전달',
      ],
    },
  ];
}

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildFieldChecklistHtml(category: 'container' | 'truck', options: FieldChecklistOptions = {}): string {
  const groups = fieldChecklistGroups(category, options).map(group =>
    `<h3>${escape(group.title)}</h3><div class="final-check">${group.items.map(item => `<div>□ ${escape(item)}</div>`).join('')}</div>`).join('');
  const records = [
    category === 'container' ? '씰 번호' : '덮개·결박 확인자',
    '사진 기록 (공컨 · 절반 · 만재 · 도어 닫음)',
    '출발 후 재조임 지점',
  ].map(label => `<div><span>${escape(label)}</span><b>&nbsp;</b></div>`).join('');
  return `<div data-field-checklist="${category}"${options.pallet ? ' data-field-checklist-unit="pallet"' : ''}>${groups}<h3>현장 기록</h3><div class="report-signoff">${records}</div></div>`;
}
