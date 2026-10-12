import { useCallback, useState } from 'react';
import { uiMessage, useUiLanguage } from './uiLanguage';

/** Keep status copy reactive without putting translated values into persisted app data. */
export function useUiMessage(initial = '') {
  useUiLanguage();
  const [source, setSource] = useState<string | (() => string)>(initial);
  const setMessage = useCallback((next: string | (() => string)) => setSource(() => next), []);
  return [typeof source === 'function' ? source() : uiMessage(source), setMessage] as const;
}
