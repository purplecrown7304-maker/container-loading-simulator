export const SHIPMENT_FIELDS = [
  ['customer', '거래처'], ['destination', '목적지'], ['vehicle', '차량/컨테이너 No.'], ['departure', '출고 예정'],
] as const;

export function reportShipmentFields() {
  return `<section class="report-shipment-entry" aria-label="출하정보 입력"><b>인쇄 전 출하정보 확인</b><div>${SHIPMENT_FIELDS.map(([id, label]) => `<label>${label}<input data-shipment-input="${id}" aria-label="${label}" maxlength="120" placeholder="미입력"></label>`).join('')}</div><p role="status" id="shipment-input-status">출하정보 4개 항목을 입력하세요. 빈 항목은 인쇄본에 ‘미입력’으로 표시됩니다.</p></section>`;
}

export function reportShipmentValues() {
  return `<div class="shipment-manual report-shipment-values">${SHIPMENT_FIELDS.map(([id, label]) => `<div><span>${label}</span><b data-shipment-value="${id}" class="shipment-missing">미입력</b></div>`).join('')}</div>`;
}

// Static script only. User values enter the printable document through textContent, never innerHTML.
export const REPORT_SHIPMENT_SCRIPT = `<script>
(() => {
  const inputs = [...document.querySelectorAll('[data-shipment-input]')];
  const sync = () => {
    const missing = [];
    for (const input of inputs) {
      const value = input.value.trim();
      for (const target of document.querySelectorAll('[data-shipment-value="' + input.dataset.shipmentInput + '"]')) {
        target.textContent = value || '미입력';
        target.classList.toggle('shipment-missing', !value);
      }
      if (!value) missing.push(input.getAttribute('aria-label'));
    }
    const status = document.getElementById('shipment-input-status');
    if (status) status.textContent = missing.length ? '미입력: ' + missing.join(' · ') : '출하정보 입력 완료 · 내용을 확인한 뒤 인쇄하세요.';
    return missing;
  };
  inputs.forEach(input => input.addEventListener('input', sync));
  window.addEventListener('beforeprint', sync);
  document.querySelector('[data-report-print]').addEventListener('click', () => {
    const missing = sync();
    if (missing.length && !window.confirm('출하정보 미입력: ' + missing.join(', ') + '\\n미입력 표시를 포함해 인쇄하시겠습니까?')) {
      inputs.find(input => !input.value.trim())?.focus(); return;
    }
    window.print();
  });
})();
</script>`;
