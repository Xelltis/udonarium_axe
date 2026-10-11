import { TestBed } from '@angular/core/testing';
import { FirstPersonPropsService } from '@axe/application/tabletop/first-person-props.service';
import { Card } from '@axe/domain/card/card';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('FirstPersonPropsService', () => {
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  function service(): FirstPersonPropsService {
    return TestBed.inject(FirstPersonPropsService);
  }

  function propOf(identifier: string) {
    return service()
      .props()
      .find((prop) => prop.id === identifier);
  }

  it('stands a light up where it hangs, and draws one that is out dimmer', () => {
    const light = new LightSource();
    light.initialize();
    light.location = { name: 'table', x: 2 * GRID, y: 3 * GRID };
    table.appendChild(light);

    expect(propOf(light.identifier)).toMatchObject({ kind: 'stand', what: 'light', x: 125, y: 175, opacity: 1 });

    light.lightEnabled = false;
    expect(propOf(light.identifier)?.opacity).toBe(0.4);
  });

  it('glows only where a light is lit, in its own colour, and where a block gives light too', () => {
    const light = new LightSource();
    light.initialize();
    light.location = { name: 'table', x: 0, y: 0 };
    light.lightColor = '#ff8800';
    table.appendChild(light);
    const lamp = Terrain.create('灯', 1, 1, 1, '', '');
    lamp.location = { name: 'table', x: 4 * GRID, y: 4 * GRID };
    lamp.lightEnabled = true;
    table.appendChild(lamp);

    const glows = service().glows();
    expect(glows.find((glow) => glow.id === light.identifier)?.color).toBe('#ff8800');
    expect(glows.some((glow) => glow.id === `${lamp.identifier}:light`)).toBe(true);

    light.lightEnabled = false;
    expect(
      service()
        .glows()
        .some((glow) => glow.id === light.identifier)
    ).toBe(false);
  });

  it('lays a card flat on the floor, turned the way it lies', () => {
    const card = Card.create('札', 'front', 'back');
    card.location = { name: 'table', x: 2 * GRID, y: 2 * GRID };
    card.rotate = 30;

    expect(propOf(card.identifier)).toMatchObject({ kind: 'lie', what: 'card', rotate: 30 });
  });

  it('keeps the face of a die rolled by somebody else dark, and names the face only to them', () => {
    const dice = DiceSymbol.create('ダイス', 6, 1);
    dice.location = { name: 'table', x: 0, y: 0 };
    dice.owner = 'someone-else';

    expect(propOf(dice.identifier)).toMatchObject({ kind: 'stand', what: 'dice', dark: true });
    expect(propOf(dice.identifier)?.label).toContain('???');
  });

  it('lays a coin flat as a disc', () => {
    const coin = Coin.create('コイン', 1);
    coin.location = { name: 'table', x: 0, y: 0 };

    expect(propOf(coin.identifier)).toMatchObject({ kind: 'lie', what: 'coin', round: true });
  });

  it('lays a mask over the floor in its own colour and strength', () => {
    const mask = GameTableMask.create('マスク', 2, 2, 50);
    mask.location = { name: 'table', x: 0, y: 0 };
    table.appendChild(mask);

    expect(propOf(mask.identifier)).toMatchObject({ kind: 'lie', what: 'mask', x: 50, y: 50, width: 100 });
  });

  it('washes the floor where the air of the room is drawn', () => {
    const ambience = new TableAmbience();
    ambience.createDataElements();
    ambience.initialize();
    ambience.ambienceKind = 'swamp';
    ambience.location = { name: 'table', x: 0, y: 0 };
    table.appendChild(ambience);

    const prop = propOf(ambience.identifier);

    expect(prop).toMatchObject({ kind: 'lie', what: 'ambience' });
    expect(prop?.wash.length).toBeGreaterThan(0);
  });

  it('hangs a card on the wall it is pinned to, upright and facing into the room', () => {
    table.wallHeight = 4;
    table.showNorthWall = true;
    const card = Card.create('札', 'front', 'back');
    card.location = { name: 'table', x: 100, y: 30 };
    card.location.surface = 'north-wall';

    expect(propOf(card.identifier)).toMatchObject({ kind: 'board', what: 'card', y: 0, rotate: 0 });
  });

  it('leaves a card on a wall the table does not show out of it', () => {
    table.wallHeight = 4;
    table.showNorthWall = false;
    const card = Card.create('札', 'front', 'back');
    card.location = { name: 'table', x: 100, y: 30 };
    card.location.surface = 'north-wall';

    expect(propOf(card.identifier)).toBeUndefined();
  });

  it('leaves out what is off the table', () => {
    const card = Card.create('札', 'front', 'back');
    card.location = { name: 'graveyard', x: 0, y: 0 };

    expect(propOf(card.identifier)).toBeUndefined();
  });
});
