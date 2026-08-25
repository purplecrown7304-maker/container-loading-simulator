import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearLatestInertiaCertification } from './inertiaCertification';
import {
  defaultSecuringMaterialSettings,
  readSecuringMaterialSettings,
  writeSecuringMaterialSettings,
  type SecuringMaterialSettings,
} from './securingMaterialSettings';

const fields: Array<{ key: keyof SecuringMaterialSettings; label: string; unit: string }> = [
  { key: 'bandingKgPerM', label: '밴딩', unit: 'kg/m' },
  { key: 'cornerGuardKgPerM', label: '각대', unit: 'kg/m' },
  { key: 'wrappingKgPerM', label: '랩핑 필름', unit: 'kg/m' },
  { key: 'antiSlipKgPerEa', label: '미끄럼방지재', unit: 'kg/EA' },
  { key: 'dunnageKgPerEa', label: '블로킹재', unit: 'kg/EA' },
  { key: 'loadBarKgPerEa', label: '고정바', unit: 'kg/EA' },
];

export default function SecuringMaterialSettingsPanel() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [settings, setSettings] = useState<SecuringMaterialSettings>(readSecuringMaterialSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const locate = () => setHost(document.querySelector<HTMLElement>('.loading-options'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!host) return null;
  const update = (key: keyof SecuringMaterialSettings, value: string) => {
    setSaved(false);
    const number = Number(value);
    setSettings(current => ({ ...current, [key]: Number.isFinite(number) && number >= 0 ? number : 0 }));
  };
  const save = () => {
    writeSecuringMaterialSettings(settings);
    clearLatestInertiaCertification();
    setSaved(true);
  };
  const reset = () => {
    const next = { ...defaultSecuringMaterialSettings };
    setSettings(next);
    writeSecuringMaterialSettings(next);
    clearLatestInertiaCertification();
    setSaved(true);
  };

  return createPortal(<details className="securing-material-settings">
    <summary>적재 보조자재 실제 중량 설정</summary>
    <p>현장에서 쓰는 자재의 실제 단위중량을 입력하면 관성검증의 추가중량·최대중량 판정과 작업지시서/Excel에 반영됩니다.</p>
    <div className="securing-material-settings-grid">
      {fields.map(field => <label key={field.key}>
        <span>{field.label}</span>
        <div><input type="number" min="0" step="0.001" value={settings[field.key]} onChange={event => update(field.key,event.target.value)} /><small>{field.unit}</small></div>
      </label>)}
    </div>
    <div className="securing-material-settings-actions">
      <button type="button" onClick={reset}>기본값</button>
      <button type="button" className="primary" onClick={save}>현장값 저장</button>
      {saved && <span>저장됨 · 기존 관성 PASS 재검증 필요</span>}
    </div>
    <small className="securing-material-settings-note">단위중량만 바뀝니다. 밴딩/랩핑의 시뮬레이션 구속 성능계수는 안전상 임의 변경하지 않습니다.</small>
  </details>, host);
}
