import { findPalletType, palletMaterialLabel, type PalletMaterial, type PalletType } from './engine/palletCatalog';
import { palletDestinationFit } from './engine/palletDestination';
import { readUiLanguage, uiText, type UiLanguage } from './uiLanguage';

/** Translate only unchanged built-in copy. Custom pallet names, standards and notes
 * remain verbatim even when they happen to match another translated UI label.
 */
export function palletDisplayText(pallet: PalletType, field: 'name' | 'standard' | 'note', locale: UiLanguage = readUiLanguage()): string {
  const value = pallet[field];
  const original = findPalletType(pallet.id)?.[field];
  return original === value ? uiText(value, [], locale) : value;
}

export function palletMaterialDisplayLabel(material: PalletMaterial, locale: UiLanguage = readUiLanguage()): string {
  return uiText(palletMaterialLabel(material), [], locale);
}

/** A display copy of the engine verdict: the status and source inputs stay canonical. */
export function palletDestinationDisplayFit(
  container: Parameters<typeof palletDestinationFit>[0],
  pallet: Parameters<typeof palletDestinationFit>[1],
  locale: UiLanguage = readUiLanguage(),
) {
  const fit = palletDestinationFit(container, pallet);
  return { ...fit, label: uiText(fit.label, [], locale) };
}
