import { setUiLanguage, UI_LANGUAGES, useUiLanguage } from './uiLanguage';
import './language-switcher.css';

export default function LanguageSwitcher() {
  const selected = useUiLanguage();
  return <div className="header-language-switcher" role="group" aria-label="Language / 언어 / Ngôn ngữ" data-view-only="true">
    {UI_LANGUAGES.map(({ id, label }) => <button key={id} type="button" lang={id} aria-pressed={selected === id}
      onClick={() => setUiLanguage(id)}>{label}</button>)}
  </div>;
}
