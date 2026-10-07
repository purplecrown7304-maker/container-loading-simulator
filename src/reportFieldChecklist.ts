/**
 * LOADING_RULES R-10. Field checks the simulator cannot calculate: equipment condition,
 * securing work, seal and photo records. Static, printed as blank boxes for the worker;
 * it never states that a check was done and never changes approval or PASS.
 */
export type FieldChecklistGroup = { title: string; items: string[] };

export function fieldChecklistGroups(category: 'container' | 'truck'): FieldChecklistGroup[] {
  const container = category === 'container';
  return [
    {
      title: '적재 전',
      items: [
        '출고 서류의 품명·수량·중량이 실물과 일치',
        container ? '컨테이너 번호가 배차 서류와 일치' : '차량 번호와 적재중량이 배차 서류와 일치',
        container ? '안에서 문을 닫았을 때 빛이 새는 곳 없음 (벽·지붕·바닥·문 패킹)' : '적재함 바닥·문짝·고박 고리 손상 없음',
        '내부가 깨끗하고 말라 있으며 냄새·못·돌출물 없음',
        '박스·파렛트에 파손·젖음·튀어나옴 없음',
        '고박 자재의 수량이 맞고 손상 없음',
        '바퀴 고임목 설치, 작업 구역에 사람 없음',
      ],
    },
    {
      title: '적재 중',
      items: [
        '작업지시서의 구역 순서대로, 안쪽 벽과 좌우 벽에 붙여 적재',
        '무거운 화물이 아래, 취급 표시와 단수 제한 준수',
        '화물 사이와 벽 쪽 빈 공간을 지시된 자재로 메움',
        '절반 적재 시점에 사진 촬영',
      ],
    },
    {
      title: '적재 후',
      items: [
        '문 쪽 마지막 줄 고정 확인',
        '스트랩 장력과 모서리 보호대 확인',
        '만재 상태와 문을 닫은 상태 사진 촬영',
        container ? '봉인 체결, 봉인 번호 기록' : '덮개 또는 결박으로 낙하 방지 조치',
        container ? '수출 화물이면 검증 총중량(VGM) 제출' : '적재 높이·폭·길이가 도로 운행 한도 이내',
        '운전자에게 화물 특성·중량·하차 순서·재조임 지점 전달',
      ],
    },
  ];
}

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildFieldChecklistHtml(category: 'container' | 'truck'): string {
  const groups = fieldChecklistGroups(category).map(group =>
    `<h3>${escape(group.title)}</h3><div class="final-check">${group.items.map(item => `<div>□ ${escape(item)}</div>`).join('')}</div>`).join('');
  const records = [
    category === 'container' ? '봉인 번호' : '덮개·결박 확인자',
    '사진 기록 (빈 상태 · 절반 · 만재 · 문 닫음)',
    '출발 후 재조임 지점',
  ].map(label => `<div><span>${escape(label)}</span><b>&nbsp;</b></div>`).join('');
  return `<div data-field-checklist="${category}">${groups}<h3>현장 기록</h3><div class="report-signoff">${records}</div></div>`;
}
