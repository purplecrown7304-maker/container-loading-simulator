import { uiText as uiT, useUiLanguage } from './uiLanguage';
import { normalizeViewerEnvironment, saveViewerEnvironment, useViewerEnvironment, VIEWER_ENVIRONMENTS } from './viewerEnvironment';
import './viewer-background-selector.css';

export default function ViewerBackgroundSelector() {
  useUiLanguage();
  const environment = useViewerEnvironment();
  return <label className="viewer-background-selector" title={uiT("보기 전용 · 적재 계산과 무관")}>
    <span>{uiT("배경")}</span>
    <select data-view-only="true" aria-label={uiT("3D 배경")} value={environment}
      onChange={event => saveViewerEnvironment(normalizeViewerEnvironment(event.target.value))}>
      {VIEWER_ENVIRONMENTS.map(option => <option key={option.id} value={option.id}>{uiT(option.label)}</option>)}
    </select>
  </label>;
}
