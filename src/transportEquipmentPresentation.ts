import { getTransportEquipment, type TransportEquipment } from './transportEquipment';
import { uiText, type UiLanguage, readUiLanguage } from './uiLanguage';

/** Only the unchanged built-in catalog text is localizable. A user's renamed equipment,
 * provenance note or custom description stays verbatim, even if it resembles a UI label.
 */
export function equipmentDisplayText(equipment: TransportEquipment, field: 'name' | 'shortName' | 'sourceLabel' | 'note', locale: UiLanguage = readUiLanguage()): string {
  const value = equipment[field] ?? '';
  const original = getTransportEquipment(equipment.id)?.[field];
  if (field === 'sourceLabel' && original && value === `${original} · 사용자 수정 규격`) return `${uiText(original, [], locale)} · ${uiText('사용자 수정 규격', [], locale)}`;
  return original === value ? uiText(value, [], locale) : value;
}
