import { readFileSync } from 'node:fs';

import { type TranslateFn } from '@axe/application/i18n/translate.token';
import { SUPPORTED_LANGS } from '@axe/application/i18n/transloco.config';
import { makeDefaultTable, makeDefaultTabletopObjects } from '@axe/application/tabletop/tabletop-default-setup';
import { isTutorialPart, TUTORIAL_PARTS } from '@axe/application/tabletop/tutorial-board';
import { TUTORIAL_PANELS, tutorialScene } from '@axe/application/tabletop/tutorial-board-faces';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { type MapScene, type TextItem } from '@axe/domain/map-editor/scene';
import { textBox } from '@axe/domain/map-editor/scene-geometry';
import { deserializeScene } from '@axe/domain/map-editor/serialize';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { groundFieldOn } from '@axe/domain/tabletop/ground/ground-field';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { MAX_BOARD_PITCH, WhiteBoard } from '@axe/domain/tabletop/white-board';

const CELL = 50;
const BOARD = 'tutorialBoard';

/** A translator that writes every key back in brackets, so where each text came from can be read off it. */
const bracketed: TranslateFn = (key) => `[${key}]`;

/** The translator a language's own dictionary makes, which leaves a key it lacks as the key. */
function translatorFor(language: string): TranslateFn {
  const dictionary = JSON.parse(readFileSync(`src/assets/i18n/${language}.json`, 'utf-8')) as Record<string, unknown>;
  return (key) => {
    let found: unknown = dictionary;
    for (const part of key.split('.')) found = (found as Record<string, unknown> | undefined)?.[part];
    return typeof found === 'string' ? found : key;
  };
}

function get<T>(identifier: string): T {
  const found = ObjectStore.instance.get(identifier);
  expect(found, identifier).toBeTruthy();
  return found as T;
}

function table(): GameTable {
  return TableSelecter.instance.viewTable!;
}

function textsOf(scene: MapScene): TextItem[] {
  return scene.layers.flatMap((layer) => (layer.kind === 'text' ? layer.items : []));
}

/** The words written on a board, once the part that writes them has loaded. */
async function wordsOn(identifier: string): Promise<TextItem[]> {
  const board = get<WhiteBoard>(identifier);
  await vi.waitFor(() => expect(board.scene).not.toBe(''));
  const scene = deserializeScene(board.scene);
  expect(scene).not.toBeNull();
  return textsOf(scene!);
}

/** Where a part of the board runs across it, in cells of the table. */
function panelSpan(face: string): { from: number; to: number } {
  const panel = TUTORIAL_PANELS.find((each) => each.face === face)!;
  const left = get<WhiteBoard>(BOARD).location.x / CELL;
  return { from: left + panel.from, to: left + panel.to };
}

describe('the tutorial a first table is set out with', () => {
  function setOut(t: TranslateFn = bracketed, standing = true): void {
    makeDefaultTable(ImageStorage.instance);
    makeDefaultTabletopObjects(ImageStorage.instance, t, standing);
  }

  it('puts up a board, a note and the things the board speaks of, under names of their own', () => {
    setOut();

    expect(get<WhiteBoard>(BOARD)).toBeInstanceOf(WhiteBoard);
    expect(get<TextNote>('tutorialNote')).toBeInstanceOf(TextNote);
    const dice = ['tutorialDice_1', 'tutorialDice_2', 'tutorialDice_3', 'tutorialDice_4'].map((identifier) =>
      get<DiceSymbol>(identifier)
    );
    for (const die of dice) expect(die).toBeInstanceOf(DiceSymbol);
    // One of each of the kinds most played with, rather than two of a kind that read as the same thing twice.
    expect(dice.map((die) => die.name)).toEqual(['D4', 'D6', 'D8', 'D20']);
    expect(get<Coin>('tutorialCoin')).toBeInstanceOf(Coin);
    expect(get<Terrain>('tutorialCrate')).toBeInstanceOf(Terrain);
    expect(get<LightSource>('tutorialLight')).toBeInstanceOf(LightSource);
    expect(TUTORIAL_PARTS.every((identifier) => isTutorialPart(identifier))).toBe(true);
    expect(isTutorialPart('testCharacter_1')).toBe(false);
  });

  it('keeps the board, the crate and the light on the table, which takes them away when it is cleared', () => {
    setOut();

    expect(table().whiteBoards.map((board) => board.identifier)).toEqual([BOARD]);
    expect(table().terrains.map((terrain) => terrain.identifier)).toContain('tutorialCrate');
    expect(table().lightSources.map((light) => light.identifier)).toContain('tutorialLight');
  });

  it('writes the board and the note in the language it is handed', async () => {
    setOut();

    expect(get<WhiteBoard>(BOARD).name).toBe('[feature.tabletop.tutorial.board.name]');
    const written = (await wordsOn(BOARD)).map((item) => item.text);
    expect(written).toContain('[feature.tabletop.tutorial.board.title]');
    expect(written).toContain('[feature.tabletop.tutorial.board.panMouse]');
    expect(written).toContain('[feature.tabletop.tutorial.board.menuTouch]');
    for (const topic of ['pieces', 'chat', 'battle', 'vision']) {
      expect(written).toContain(`[feature.tabletop.tutorial.${topic}.title]`);
      expect(written.join('').replace(/\n/g, '')).toContain(`[feature.tabletop.tutorial.${topic}.text]`);
    }
    expect(get<TextNote>('tutorialNote').title).toBe('[feature.tabletop.tutorial.note.title]');
    expect(get<TextNote>('tutorialNote').text).toBe('[feature.tabletop.tutorial.note.text]');
  });

  it('stands the board along the table’s north edge, as wide as the table', () => {
    setOut();
    const board = get<WhiteBoard>(BOARD);

    expect(board.pitch).toBe(MAX_BOARD_PITCH);
    expect(board.location.y + board.height * CELL).toBe(0);
    expect(board.location.x).toBe(0);
    expect(board.width).toBe(table().width);
  });

  it('sets the welcome across the board and the four parts of the table side by side, all inside the board', () => {
    setOut();
    const board = get<WhiteBoard>(BOARD);
    const [welcome, ...topics] = TUTORIAL_PANELS;

    expect(TUTORIAL_PANELS.map((panel) => panel.face)).toEqual(['welcome', 'pieces', 'chat', 'battle', 'vision']);
    expect(welcome.from).toBe(topics[0].from);
    expect(welcome.to).toBe(topics[topics.length - 1].to);
    expect(welcome.from).toBeGreaterThanOrEqual(0);
    expect(welcome.to).toBeLessThanOrEqual(board.width);
    for (let index = 1; index < topics.length; index++) {
      expect(topics[index].from).toBeGreaterThan(topics[index - 1].to);
    }
  });

  it('lays the dice and the coin in front of the part on them, and the crate and the light in front of the game master’s', () => {
    setOut();
    const within = (identifier: string, face: string, cells = 1) => {
      const { location } = get<{ location: { x: number } }>(identifier);
      const span = panelSpan(face);
      const middle = location.x / CELL + cells / 2;
      expect(middle, identifier).toBeGreaterThan(span.from);
      expect(middle, identifier).toBeLessThan(span.to);
    };

    for (const identifier of ['tutorialDice_1', 'tutorialDice_2', 'tutorialDice_3', 'tutorialDice_4', 'tutorialCoin']) {
      within(identifier, 'chat');
    }
    within('tutorialCrate', 'vision', 2);
    within('tutorialLight', 'vision');
  });

  it('lays the board flat north of the table where it is seen from above', () => {
    setOut(bracketed, false);
    const board = get<WhiteBoard>(BOARD);

    expect(board.pitch).toBe(0);
    expect(board.location.y + board.height * CELL).toBe(0);
  });

  it('fixes the board, so a drag meant for the table leaves it where it is, and leaves the note to be written on', () => {
    setOut();

    expect(get<WhiteBoard>(BOARD).isLock).toBe(true);
    expect(get<TextNote>('tutorialNote').isLock).toBe(false);
  });

  it('lays everything else on the table, each thing in cells of its own, clear of the pieces', () => {
    setOut();
    const taken = new Map<string, string>();
    const take = (identifier: string, x: number, y: number, size: number) => {
      expect(Number.isInteger(x) && Number.isInteger(y), `${identifier} at ${x},${y}`).toBe(true);
      for (let dx = 0; dx < size; dx++) {
        for (let dy = 0; dy < size; dy++) {
          const cell = `${x + dx},${y + dy}`;
          expect(taken.get(cell), `${identifier} at ${cell}`).toBeUndefined();
          expect(x + dx >= 0 && x + dx < table().width && y + dy >= 0 && y + dy < table().height, cell).toBe(true);
          taken.set(cell, identifier);
        }
      }
    };
    for (const identifier of [
      'tutorialDice_1',
      'tutorialDice_2',
      'tutorialDice_3',
      'tutorialDice_4',
      'tutorialCoin',
      'tutorialLight',
    ]) {
      const { location } = get<{ location: { x: number; y: number } }>(identifier);
      take(identifier, location.x / CELL, location.y / CELL, 1);
    }
    const crate = get<Terrain>('tutorialCrate');
    take('crate', crate.location.x / CELL, crate.location.y / CELL, 1);
    take('crate', crate.location.x / CELL + 1, crate.location.y / CELL, 1);
    for (const piece of ObjectStore.instance.getObjects<GameCharacter>(GameCharacter)) {
      take(piece.name, piece.location.x / CELL, piece.location.y / CELL, piece.size);
    }
  });

  it('stands the monsters on a step of the ground, all at one height above the party, which stands on the flat', () => {
    setOut();
    const ground = groundSurfaceOf(groundFieldOn(table())!.readChunks());
    const under = (piece: GameCharacter) =>
      ground.heightAt(piece.location.x / CELL + piece.size / 2, piece.location.y / CELL + piece.size / 2);
    const pieces = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter);
    const monsters = pieces.filter((piece) => piece.isNpc).map(under);
    const party = pieces.filter((piece) => !piece.isNpc).map(under);

    for (const height of monsters) expect(height).toBeCloseTo(1.5, 2);
    expect(party.every((height) => height === 0)).toBe(true);
    expect(ground.heightAt(12, 1.5)).toBe(0);
  });

  it('stands the pieces across the middle of the table, from side to side', () => {
    setOut();
    const pieces = ObjectStore.instance.getObjects<GameCharacter>(GameCharacter);
    const west = Math.min(...pieces.map((piece) => piece.location.x / CELL));
    const east = Math.max(...pieces.map((piece) => piece.location.x / CELL + piece.size));

    expect(Math.abs((west + east) / 2 - table().width / 2)).toBeLessThanOrEqual(1);
  });

  for (const language of SUPPORTED_LANGS) {
    it(`fits every word of the board in its part, in ${language}`, () => {
      const t = translatorFor(language);
      setOut(t);
      const board = get<WhiteBoard>(BOARD);

      for (const item of textsOf(tutorialScene(t, board.width, board.height))) {
        const box = textBox(item);
        const panel = TUTORIAL_PANELS.find((each) => item.id.startsWith(`${each.face}-`));
        const from = panel ? panel.from * CELL : 0;
        const to = panel ? panel.to * CELL : board.width * CELL;
        expect(box.x, item.text).toBeGreaterThanOrEqual(from);
        expect(box.x + box.w, item.text).toBeLessThanOrEqual(to);
        expect(box.y + box.h, item.text).toBeLessThanOrEqual(board.height * CELL);
      }
    });

    it(`leaves no key showing in what it writes, in ${language}`, () => {
      const t = translatorFor(language);
      setOut(t);

      const board = get<WhiteBoard>(BOARD);
      const written = [
        board.name,
        ...textsOf(tutorialScene(t, board.width, board.height)).map((item) => item.text),
        get<TextNote>('tutorialNote').title,
        get<TextNote>('tutorialNote').text,
      ];
      expect(written.filter((text) => text.includes('feature.tabletop.tutorial'))).toEqual([]);
    });
  }
});
