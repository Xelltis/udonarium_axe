import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { RangeShapeFieldValue } from '@axe/domain/data/range-shape-field';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { RangeArea } from '@axe/domain/tabletop/range';

@Injectable({ providedIn: 'root' })
export class RangeShapeInvokeService {
  private readonly tabletopService = inject(TabletopService);
  private readonly translateFn = inject(TRANSLATE_FN);

  /**
   * Puts a custom range from a range-shape field onto the current table at a point, with a sound.
   *
   * A field with no name is given the default one.
   */
  spawnAt(position: PointerCoordinate, field: RangeShapeFieldValue): RangeArea {
    const name = field.name.trim() || this.translateFn('feature.range.custom.defaultName');
    const range = RangeArea.createCustom(name, field.cellPattern, field.gridType, 100, {
      isRotatable: field.isRotatable,
    });
    range.gridColor = field.gridColor;
    range.rangeColor = field.rangeColor;
    range.location.x = position.x;
    range.location.y = position.y;
    range.posZ = position.z ?? 0;
    this.tabletopService.currentTable.appendChild(range);
    SoundEffect.play(PresetSound.cardPut);
    return range;
  }

  /** Puts a custom range from a range-shape field onto the current table, centred on a piece. */
  spawnForCharacter(character: GameCharacter, field: RangeShapeFieldValue): RangeArea {
    const cellPx = 50;
    const center: PointerCoordinate = {
      x: character.location.x + (character.size * cellPx) / 2,
      y: character.location.y + (character.size * cellPx) / 2,
      z: character.posZ,
    };
    return this.spawnAt(center, field);
  }
}
