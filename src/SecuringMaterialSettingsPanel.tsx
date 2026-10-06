import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearLatestInertiaCertification } from './inertiaCertification';
import {
  defaultSecuringMaterialSettings,
  normalizeSecuringMaterialSettings,
  readSecuringMaterialSettings,
  writeSecuringMaterialSettings,
  type SecuringMaterialSettings,
  type VoidFillMaterialRule,
  type VoidFillMaterialSettings,
} from './securingMaterialSettings';

type WeightKey = Exclude<keyof SecuringMaterialSettings, 'voidFill'>;
type VoidKey = keyof VoidFillMaterialSettings;

const fields: Array<{ key: WeightKey; label: string; unit: string }> = [
  { key: 'bandingKgPerM', label: '밴딩', unit: 'kg/m' },
  { key: 'cornerGuardKgPerM', label: '각대', unit: 'kg/m' },
  { key: 'wrappingKgPerM', label: '랩핑 필름', unit: 'kg/m' },
  { key: 'antiSlipKgPerEa', label: '미끄럼방지재', unit: 'kg/EA' },
  { key: 'dunnageKgPerEa', label: '블로킹재', unit: 'kg/EA' },
  { key: 'loadBarKgPerEa', label: '고정바', unit: 'kg/EA' },
];

const voidLabels: Record<VoidKey, string> = {
  sideGap: '옆 틈',
  doorFace: '문 쪽 면',
  heightStep: '높이 단차',
  rowHole: '줄 안 빈칸',
  topVoid: '상단 빈자리',
};

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
  const update = (key: WeightKey, value: string) => {
    setSaved(false);
    const number = Number(value);
    setSettings(current => ({ ...current, [key]: Number.isFinite(number) && number >= 0 ? number : 0 }));
  };
  const updateVoid = (key: VoidKey, field: keyof Pick<VoidFillMaterialRule, 'unitWeightKg' | 'unitCoverageM2' | 'minGapM' | 'maxGapM'>, value: string) => {
    setSaved(false);
    const number = Number(value);
    setSettings(current => normalizeSecuringMaterialSettings({
      ...current,
      voidFill: {
        ...current.voidFill,
        [key]: { ...current.voidFill[key], [field]: Number.isFinite(number) && number >= 0 ? number : 0 },
      },
    }));
  };
  const save = () => {
    writeSecuringMaterialSettings(settings);
    clearLatestInertiaCertification();
    setSaved(true);
  };
  const reset = () => {
    const next = normalizeSecuringMaterialSettings(defaultSecuringMaterialSettings);
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
    <h4>실제 빈 공간 메움 기본값</h4>
    <p className="securing-material-settings-note">앱 기본값이며 현장 자재로 확인 필요. 제조사 정격이나 실제 운송 안전을 보증하지 않습니다.</p>
    <div className="securing-material-settings-grid">
      {(Object.keys(voidLabels) as VoidKey[]).map(key => {
        const rule = settings.voidFill[key];
        return <fieldset key={key}>
          <legend>{voidLabels[key]} · {rule.label}</legend>
          <label><span>단중</span><div><input type="number" min="0" step="0.01" value={rule.unitWeightKg} onChange={event => updateVoid(key,'unitWeightKg',event.target.value)} /><small>kg/EA</small></div></label>
          <label><span>1개 커버 면적</span><div><input type="number" min="0.000001" step="0.01" value={rule.unitCoverageM2} onChange={event => updateVoid(key,'unitCoverageM2',event.target.value)} /><small>m²</small></div></label>
          <label><span>적용 최소 간격/스팬</span><div><input type="number" min="0" step="0.001" value={rule.minGapM} onChange={event => updateVoid(key,'minGapM',event.target.value)} /><small>m</small></div></label>
          <label><span>적용 최대 간격/스팬</span><div><input type="number" min="0" step="0.001" value={rule.maxGapM} onChange={event => updateVoid(key,'maxGapM',event.target.value)} /><small>m</small></div></label>
          <small>{rule.sourceNote}</small>
        </fieldset>;
      })}
    </div>
    <div className="securing-material-settings-actions">
      <button type="button" onClick={reset}>기본값</button>
      <button type="button" className="primary" onClick={save}>현장값 저장</button>
      {saved && <span>저장됨 · 기존 관성 PASS 재검증 필요</span>}
    </div>
    <small className="securing-material-settings-note">단위중량만 바꾸는 기존 설정 외에 빈 공간 자재의 계획 단중·적용범위를 편집할 수 있습니다. 적용범위를 벗어난 자재는 관성 검증의 고정 지지물로 인정하지 않습니다.</small>
  </details>, host);
}
