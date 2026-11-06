import { furnishingModelUrl, isFurnishingModel } from '@axe/domain/tabletop/dungeon/furnishing-models';
import { FIELD_MODEL_IDS, type FieldModelId, fieldModelUrl } from '@axe/domain/tabletop/field/field-models';
import { isTownModel, townModelUrl } from '@axe/domain/tabletop/field/town-models';

/** Where a model bundled with the app is served from, by its name, or null for a name none has. */
export function bundledModelUrl(id: string): string | null {
  if (isFurnishingModel(id)) return furnishingModelUrl(id);
  if (isTownModel(id)) return townModelUrl(id);
  if ((FIELD_MODEL_IDS as readonly string[]).includes(id)) return fieldModelUrl(id as FieldModelId);
  return null;
}
