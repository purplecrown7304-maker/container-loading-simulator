import type { WorkStep } from './engine/workSequence';
import { readUiLanguage, uiMessage, uiText, type UiLanguage } from './uiLanguage';
import { uiMessagesWorkflow } from './uiMessagesWorkflow';

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Only these template slots contain other application-owned labels. All other
// captures (including cargo names/IDs) are kept byte-for-byte, never translated.
const labelSlots: Readonly<Record<string, readonly number[]>> = {
  '{0} 외 {1}건': [0],
  '새 운영 오류가 발생합니다: {0} · {1}': [1],
  '기존 운영 오류가 악화됩니다: {0} · {1}': [1],
  '기존 운영 오류의 영향 범위가 커집니다: {0} · {1}': [1],
  '새 안전 차단 오류가 발생합니다: {0}': [0],
  '기존 총중량 초과가 악화됩니다: {0}': [0],
  '기존 안전 오류의 영향 범위가 커집니다: {0}': [0],
  '{0} 전략으로 물리 기반 적재 계산 중…': [0],
  '후보 {0}/{1} · {2} · 물리검증 {3}%': [2],
  '{0} 후보로 자동 스냅했습니다.': [0],
  '{0} 위치로 스마트 스냅 이동을 적용했습니다.': [0],
  '팔레트 재배치 {0}/{1} · {2}': [2],
  '최종 PASS · {0}': [0],
  '유효 팔레트 배치 전부 탐색 · 가장 안전한 실패안 적용 · {0}': [0],
  '팔레트 위 재배치 · {0}': [0],
  '안쪽 밀착 2열 · {0}': [0],
  '문쪽 밀착 2열 · {0}': [0],
  '{0} · 높이 {1}% · {2}단 제한': [0],
};
const templates = Object.keys(uiMessagesWorkflow)
  .filter(key => /\{\d+\}/.test(key))
  .sort((a, b) => b.replace(/\{\d+\}/g, '').length - a.replace(/\{\d+\}/g, '').length)
  .map(key => {
    const slots: number[] = [];
    // Short unit suffixes are not enough evidence that arbitrary text is an app message.
    // Implicit matching accepts numbers only; explicit uiText calls retain opaque values.
    const numericOnly = key.replace(/\{\d+\}|\s/g, '').length < 6;
    const capture = numericOnly ? '([+-]?\\d[\\d,.]*)' : '([\\s\\S]*?)';
    const parts = key.split(/(\{\d+\})/g).map(part => {
      const slot = /^\{(\d+)\}$/.exec(part);
      if (!slot) return escapePattern(part);
      slots.push(Number(slot[1]));
      return capture;
    });
    return { key, slots, pattern: new RegExp(`^${parts.join('')}$`) };
  });

/** Render canonical workflow status text without changing engine events or stored data. */
export function uiWorkflowText(text: string, locale: UiLanguage = readUiLanguage()): string {
  if (locale === 'ko') return text;
  const exact = uiText(text, [], locale);
  if (exact !== text) return exact;
  // Preflight wraps a known diagnostic with an additional-error count. Require
  // the inner diagnostic to be recognized before interpreting this short wrapper.
  const additionalErrors = /^(.*) 외 (\d+)건$/.exec(text);
  if (additionalErrors) {
    const message = uiWorkflowText(additionalErrors[1], locale);
    if (message !== additionalErrors[1]) return uiText('{0} 외 {1}건', [message, additionalErrors[2]], locale);
  }
  for (const { key, slots, pattern } of templates) {
    const match = pattern.exec(text);
    if (!match) continue;
    const values: string[] = [];
    slots.forEach((slot, index) => {
      const value = match[index + 1];
      values[slot] = labelSlots[key]?.includes(slot) ? uiWorkflowText(value, locale) : value;
    });
    return uiText(key, values, locale);
  }
  return uiMessage(text, locale);
}

/** User-authored item labels are deliberately not interpreted as translation keys. */
export function workflowWorkInstruction(step: WorkStep, locale: UiLanguage = readUiLanguage()): string {
  if (locale === 'ko') return step.instruction;
  return uiText('{0}번 · {1} {2} · R{3} C{4} L{5} · {6} · X {7} / Y {8} / Z {9}m', [
    step.step, step.cargoId, uiText(step.action === 'LOAD' ? '적재' : '하역', [], locale),
    step.row || '-', step.column || '-', step.layer || '-', uiText(step.zone, [], locale),
    step.x.toFixed(2), step.y.toFixed(2), step.z.toFixed(2),
  ], locale);
}
