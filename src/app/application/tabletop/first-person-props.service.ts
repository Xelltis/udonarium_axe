import { inject, Injectable } from '@angular/core';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { groundSurfaceWash } from '@axe/domain/effect/ambience/ambience-ground';
import { wallPlacementOf } from '@axe/domain/tabletop/first-person/first-person-wall';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { SurfaceDims } from '@axe/domain/tabletop/surface-space';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { lightSourcesOn } from '@axe/domain/tabletop/table-lights';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { boardSurfaceOf, surfaceOf, TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { eyeHeightPx } from '@axe/domain/tabletop/vision-scene';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';

export type FirstPersonPropKind = 'stand' | 'lie' | 'board';

export type FirstPersonPropWhat =
  'light' | 'card' | 'stack' | 'dice' | 'coin' | 'note' | 'mask' | 'trigger' | 'board' | 'ambience';

export interface FirstPersonProp {
  id: string;
  kind: FirstPersonPropKind;
  what: FirstPersonPropWhat;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  rotate: number;
  image: string;
  color: string;
  wash: string;
  opacity: number;
  dark: boolean;
  round: boolean;
  label: string;
  text: string;
}

export interface FirstPersonGlow {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
}

const CARD_ASPECT = 1.45;
const LIFT_PX = 0.5;
const UPRIGHT_BOARD_PITCH = 45;

@Injectable({ providedIn: 'root' })
export class FirstPersonPropsService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly vision = inject(VisionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly triggers = inject(TableTriggerService);

  props(): FirstPersonProp[] {
    const table = this.table();
    if (!table || table.gridSize <= 0) return [];
    this.objectChange.fileVersion();
    this.objectChange.trackMyCursor();
    const g = table.gridSize;
    return [
      ...this.lights(table, g),
      ...this.cards(table, g),
      ...this.stacks(table, g),
      ...this.dice(table, g),
      ...this.coins(table, g),
      ...this.notes(table, g),
      ...this.masks(table, g),
      ...this.shownTriggers(g),
      ...this.boards(table, g),
      ...this.ambiences(table, g),
    ];
  }

  glows(): FirstPersonGlow[] {
    const table = this.table();
    if (!table || table.gridSize <= 0) return [];
    const g = table.gridSize;
    const glows: FirstPersonGlow[] = [];
    this.objectChange.collectionOf('light-source')();
    for (const light of lightSourcesOn(table)) {
      this.objectChange.versionOf(light.identifier)();
      if (!light.lightEnabled || !this.onTheFloor(light) || this.vision.isPieceHiddenByFog(light)) continue;
      glows.push({
        id: light.identifier,
        x: light.location.x + g / 2,
        y: light.location.y + g / 2,
        z: eyeHeightPx(light.altitude, light.posZ, g),
        radius: g * 0.6,
        color: light.lightColor,
      });
    }
    for (const terrain of table.terrains) {
      if (!terrain.lightEnabled || surfaceOf(terrain) !== 'floor') continue;
      glows.push({
        id: `${terrain.identifier}:light`,
        x: terrain.location.x + (terrain.width * g) / 2,
        y: terrain.location.y + (terrain.depth * g) / 2,
        z: eyeHeightPx(terrain.altitude, terrain.posZ, g),
        radius: g * 0.6,
        color: terrain.lightColor,
      });
    }
    return glows;
  }

  private table(): GameTable | null {
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    const table = this.tableSelecter.viewTable;
    if (table) this.objectChange.versionOf(table.identifier)();
    return table;
  }

  private onTheFloor(object: TabletopObject): boolean {
    return object.isVisibleOnTable && surfaceOf(object) === 'floor' && boardSurfaceOf(object) === '';
  }

  private onShownSurface(table: GameTable, object: TabletopObject): boolean {
    if (!object.isVisibleOnTable || boardSurfaceOf(object) !== '') return false;
    const surface = surfaceOf(object);
    return surface === 'floor' || this.shownWall(table, surface);
  }

  private shownWall(table: GameTable, surface: TableSurface): boolean {
    if (table.wallHeight <= 0) return false;
    if (surface === 'north-wall') return table.showNorthWall;
    if (surface === 'east-wall') return table.showEastWall;
    if (surface === 'south-wall') return table.showSouthWall;
    if (surface === 'west-wall') return table.showWestWall;
    return false;
  }

  private wallDims(table: GameTable, g: number): SurfaceDims {
    return { widthPx: table.width * g, depthPx: table.height * g, wallHeightPx: table.wallHeight * g };
  }

  private hiddenByFog(object: TabletopObject, size: number): boolean {
    return surfaceOf(object) === 'floor' && this.vision.isPieceHiddenByFog(object, size);
  }

  private placed(table: GameTable, g: number, object: TabletopObject, prop: FirstPersonProp): FirstPersonProp {
    const surface = surfaceOf(object);
    if (surface === 'floor') return prop;
    return {
      ...prop,
      kind: 'board',
      ...wallPlacementOf(
        surface,
        object.location.x,
        object.location.y,
        prop.width,
        prop.height,
        this.wallDims(table, g)
      ),
    };
  }

  private listed<T extends TabletopObject>(
    table: GameTable,
    alias: string,
    type: abstract new (...args: never[]) => T
  ): T[] {
    this.objectChange.collectionOf(alias)();
    const found = this.objectStore.getObjects<T>(type as never);
    for (const object of found) this.objectChange.versionOf(object.identifier)();
    return found.filter((object) => this.onShownSurface(table, object));
  }

  private lights(table: GameTable, g: number): FirstPersonProp[] {
    this.objectChange.collectionOf('light-source')();
    return lightSourcesOn(table)
      .filter((light) => this.onShownSurface(table, light) && !this.hiddenByFog(light, 1))
      .map((light) =>
        this.placed(table, g, light, {
          ...blank(light.identifier, 'stand', 'light'),
          x: light.location.x + g / 2,
          y: light.location.y + g / 2,
          z: light.altitude * g + light.posZ,
          width: g,
          height: g,
          image: urlOf(light.imageFile),
          color: light.lightColor,
          opacity: light.lightEnabled ? 1 : 0.4,
        })
      );
  }

  private cards(table: GameTable, g: number): FirstPersonProp[] {
    return this.listed(table, 'card', Card)
      .filter((card) => !this.hiddenByFog(card, card.size))
      .map((card) =>
        this.placed(
          table,
          g,
          card,
          this.lying(card, 'card', card.size * g, card.size * g * CARD_ASPECT, urlOf(card.imageFile), g)
        )
      );
  }

  private stacks(table: GameTable, g: number): FirstPersonProp[] {
    return this.listed(table, 'card-stack', CardStack)
      .filter((stack) => !this.hiddenByFog(stack, stack.topCard?.size ?? 2))
      .map((stack) => {
        const width = (stack.topCard?.size ?? 2) * g;
        return this.placed(
          table,
          g,
          stack,
          this.lying(stack, 'stack', width, width * CARD_ASPECT, urlOf(stack.imageFile), g)
        );
      });
  }

  private dice(table: GameTable, g: number): FirstPersonProp[] {
    const master = this.rolePermission.canSeeHidden;
    return this.listed(table, 'dice-symbol', DiceSymbol)
      .filter((dice) => !this.hiddenByFog(dice, dice.size))
      .map((dice) => {
        const size = Math.max(1, dice.size) * g;
        const seen = dice.isVisible || master;
        return this.placed(table, g, dice, {
          ...blank(dice.identifier, 'stand', 'dice'),
          x: dice.location.x + size / 2,
          y: dice.location.y + size / 2,
          z: dice.altitude * g + dice.posZ,
          width: size,
          height: dice.specifyKomaImageFlag ? dice.komaImageHeight : size,
          rotate: dice.rotate,
          image: urlOf(dice.imageFile),
          dark: !seen,
          label: `${dice.name}: ${seen ? dice.face : '???'}`,
        });
      });
  }

  private coins(table: GameTable, g: number): FirstPersonProp[] {
    return this.listed(table, 'coin', Coin)
      .filter((coin) => !this.hiddenByFog(coin, coin.size))
      .map((coin) =>
        this.placed(table, g, coin, {
          ...this.lying(coin, 'coin', coin.size * g, coin.size * g, urlOf(coin.imageFile), g),
          color: '#d4af37',
          round: true,
        })
      );
  }

  private notes(table: GameTable, g: number): FirstPersonProp[] {
    return this.listed(table, 'text-note', TextNote)
      .filter((note) => !this.hiddenByFog(note, 1))
      .map((note) => {
        const width = note.width * g;
        const height = note.height * g;
        const readable = this.disclosure.canView(note);
        const text = readable ? [note.title, note.text].filter(Boolean).join('\n') : '█████';
        return this.placed(table, g, note, {
          ...blank(note.identifier, note.isUpright ? 'stand' : 'lie', 'note'),
          x: note.location.x,
          y: note.isUpright ? note.location.y : note.location.y - height / 2,
          z: note.altitude * g + note.posZ + (note.isUpright ? 0 : LIFT_PX),
          width,
          height,
          rotate: note.rotate,
          image: urlOf(note.imageFile),
          color: '#fdf6d8',
          text,
        });
      });
  }

  private masks(table: GameTable, g: number): FirstPersonProp[] {
    this.objectChange.collectionOf('table-mask')();
    return table.masks
      .filter((mask) => this.onTheFloor(mask))
      .map((mask) => {
        this.objectChange.versionOf(mask.identifier)();
        return {
          ...this.rect(mask, 'mask', mask.width * g, mask.height * g, g),
          image: urlOf(mask.imageFile),
          color: mask.color,
          opacity: mask.opacity,
        };
      });
  }

  private shownTriggers(g: number): FirstPersonProp[] {
    return this.triggers.shown().map((trigger: TableTrigger) => {
      const rect = trigger.rect;
      const spent = trigger.once && trigger.spent;
      return {
        ...blank(trigger.identifier, 'lie', 'trigger'),
        x: (rect.col + rect.width / 2) * g,
        y: (rect.row + rect.height / 2) * g,
        z: LIFT_PX,
        width: rect.width * g,
        height: rect.height * g,
        color: trigger.color,
        opacity: spent ? 0.08 : trigger.isShown ? 0.28 : 0.16,
      };
    });
  }

  private boards(table: GameTable, g: number): FirstPersonProp[] {
    this.objectChange.collectionOf('white-board')();
    return table.whiteBoards
      .filter((board) => this.onTheFloor(board))
      .map((board: WhiteBoard) => {
        this.objectChange.versionOf(board.identifier)();
        const width = board.width * g;
        const height = board.height * g;
        const upright = board.pitch >= UPRIGHT_BOARD_PITCH;
        return {
          ...this.rect(board, 'board', width, height, g),
          kind: upright ? ('board' as const) : ('lie' as const),
          y: upright ? board.location.y + height : board.location.y + height / 2,
          image: urlOf(board.imageFile),
          color: board.color,
          opacity: board.opacity,
        };
      });
  }

  /** The looks laid on the ground. Water is left out: the view draws it cell by cell at the height of its surface. */
  private ambiences(table: GameTable, g: number): FirstPersonProp[] {
    this.objectChange.collectionOf(TableAmbience.aliasName)();
    return table.ambiences
      .filter((area) => {
        this.objectChange.versionOf(area.identifier)();
        return area.kind !== 'water' && this.onTheFloor(area);
      })
      .map((area) => {
        return {
          ...this.rect(area, 'ambience', Math.max(1, area.width) * g, Math.max(1, area.height) * g, g),
          wash: groundSurfaceWash(area.kind, area.ambienceColor, area.density),
        };
      });
  }

  private lying(
    object: TabletopObject & { rotate: number },
    what: FirstPersonPropWhat,
    width: number,
    height: number,
    image: string,
    g: number
  ): FirstPersonProp {
    return {
      ...blank(object.identifier, 'lie', what),
      x: object.location.x + width / 2,
      y: object.location.y + height / 2,
      z: object.altitude * g + object.posZ + LIFT_PX,
      width,
      height,
      rotate: object.rotate,
      image,
    };
  }

  private rect(
    object: TabletopObject & { rotate?: number },
    what: FirstPersonPropWhat,
    width: number,
    height: number,
    g: number
  ): FirstPersonProp {
    return {
      ...blank(object.identifier, 'lie', what),
      x: object.location.x + width / 2,
      y: object.location.y + height / 2,
      z: object.altitude * g + object.posZ + LIFT_PX,
      width,
      height,
      rotate: object.rotate ?? 0,
    };
  }
}

function blank(id: string, kind: FirstPersonPropKind, what: FirstPersonPropWhat): FirstPersonProp {
  return {
    id,
    kind,
    what,
    x: 0,
    y: 0,
    z: 0,
    width: 0,
    height: 0,
    rotate: 0,
    image: '',
    color: '',
    wash: '',
    opacity: 1,
    dark: false,
    round: false,
    label: '',
    text: '',
  };
}

function urlOf(image: ImageFile | null | undefined): string {
  return image && !image.isEmpty ? image.url : '';
}
