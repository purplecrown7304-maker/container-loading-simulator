import { uiText, useUiLanguage } from './uiLanguage';
import { saveViewerQuality, useViewerQuality, VIEWER_QUALITY_OPTIONS, type ViewerQuality } from './viewerQuality';
import { useId } from 'react';
import './staging-yard.css';

/** Session-only display controls deliberately have no loading callbacks. */
export default function ViewerQualityControls() {
  useUiLanguage();
  const preference = useViewerQuality(), id = useId();
  return <div className="staging-quality-controls">
    <label htmlFor={id}>{uiText('3D 품질')}</label>
    <select id={id} data-view-only="true" value={preference.quality} onChange={event => saveViewerQuality({ ...preference, quality: event.target.value as ViewerQuality })}>
      {VIEWER_QUALITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{uiText(option.label)}</option>)}
    </select>
    <label className="staging-quality-ao"><input type="checkbox" data-view-only="true" checked={preference.quality !== 'performance' && preference.ambientOcclusion} disabled={preference.quality === 'performance'}
      onChange={event => saveViewerQuality({ ...preference, ambientOcclusion: event.target.checked })} />{uiText('접촉 음영')}</label>
  </div>;
}
