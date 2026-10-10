import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { FogMemory } from '@axe/domain/tabletop/fog/fog-memory';
import { FOG_VEIL_ALPHA } from '@axe/domain/tabletop/fog/fog-mode';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { RangeArea } from '@axe/domain/tabletop/range';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { scaleOf } from '@axe/features/first-person/first-person-style';
import { FirstPersonViewComponent } from '@axe/features/first-person/first-person-view/first-person-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MAX_MULTI_ANGLE_RESOURCE_GAUGES } from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { vi } from 'vitest';

const GRID = 50;

describe('FirstPersonViewComponent', () => {
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FirstPersonViewComponent], providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  function mount(): ComponentFixture<FirstPersonViewComponent> {
    const fixture = TestBed.createComponent(FirstPersonViewComponent);
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ComponentFixture<FirstPersonViewComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pieceAt(col: number, row: number, rotate = 0): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.rotate = rotate;
    return character;
  }

  function corridor(): void {
    for (const col of [3, 5]) {
      const terrain = Terrain.create('壁', 1, 8, 1, 'stone', 'slab');
      terrain.location = { name: 'table', x: col * GRID, y: GRID };
      table.appendChild(terrain);
    }
  }

  function lookOutOf(piece: GameCharacter): void {
    TestBed.inject(FirstPersonService).enterSeat(piece.identifier);
  }

  it('draws the walls and the floor of the corridor the piece looks down', () => {
    corridor();
    lookOutOf(pieceAt(4, 7));

    const view = element(mount());

    expect(view.querySelectorAll('[data-quad="wall"]').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-quad="floor"]').length).toBeGreaterThan(0);
  });

  it('names the way the piece faces', () => {
    lookOutOf(pieceAt(4, 7, 90));

    expect(element(mount()).querySelector('[data-facing]')?.getAttribute('data-facing')).toBe('east');
  });

  it('walks forward when W is pressed', async () => {
    const piece = pieceAt(4, 7);
    lookOutOf(piece);
    mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(piece.location.y).toBe(6 * GRID));
  });

  it('leaves W alone while something is being typed', async () => {
    const piece = pieceAt(4, 7);
    lookOutOf(piece);
    mount();
    const field = document.createElement('input');
    document.body.appendChild(field);

    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
    await new Promise((rest) => setTimeout(rest, 150));

    expect(piece.location.y).toBe(7 * GRID);
    field.remove();
  });

  it('walks from the pad', async () => {
    const piece = pieceAt(4, 7, 90);
    lookOutOf(piece);
    const view = element(mount());

    view.querySelector<HTMLButtonElement>('[data-move="forward"]')!.click();

    await vi.waitFor(() => expect(piece.location.x).toBe(5 * GRID));
  });

  it('goes back to the table from the button', () => {
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());

    view.querySelector<HTMLButtonElement>('[data-testid="first-person-exit"]')!.click();

    expect(TestBed.inject(FirstPersonService).showing()).toBe(false);
  });

  it('shows who put everyone in the view, in place of the way out', () => {
    const master = new PeerCursor();
    master.initialize();
    master.role = PeerRole.GameMaster;
    const piece = pieceAt(4, 7);
    table.sharedViewPiece = piece.identifier;
    TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);

    const view = element(mount());

    expect(view.querySelector('[data-testid="first-person-shared"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="first-person-exit"]')).toBeNull();
  });

  it('lets the weather of the room fall over the view as well', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('table-weather-overlay')).not.toBeNull();
  });

  it('keeps a map of the ground about the piece in the corner', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('[data-testid="first-person-minimap"]')).not.toBeNull();
  });

  it('marks the piece it is looking at when it is clicked, and takes the mark off again', () => {
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7));
    const fixture = mount();
    const billboard = () => element(fixture).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    billboard().click();
    expect(enemy.targeted).toBe(true);

    fixture.detectChanges();
    billboard().click();
    expect(enemy.targeted).toBe(false);
  });

  it('aims at the piece straight ahead with T, and lets it go with shift and T', () => {
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7));
    mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true, cancelable: true }));
    expect(enemy.targeted).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyT', shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(enemy.targeted).toBe(false);
  });

  it('stands a lit lamp up in the corridor and lays a card on its floor', () => {
    const light = new LightSource();
    light.initialize();
    light.location = { name: 'table', x: 4 * GRID, y: 4 * GRID };
    table.appendChild(light);
    const card = Card.create('札', 'front', 'back');
    card.location = { name: 'table', x: 4 * GRID, y: 5 * GRID };
    lookOutOf(pieceAt(4, 7));

    const view = element(mount());

    expect(view.querySelector('[data-prop="light"]')).not.toBeNull();
    expect(view.querySelector('[data-glow]')).not.toBeNull();
    expect(view.querySelector('[data-prop="card"]')).not.toBeNull();
  });

  it('plays an effect inside the view, turned to face the eye', () => {
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    const preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 5000;
    preset.staggerMs = 0;
    ObjectStore.instance.add(preset, false);
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7, 90));
    const fixture = mount();

    TestBed.inject(EffectPlaybackService).play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: enemy.identifier, x: 4.5 * GRID, y: 4.5 * GRID, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    const sprites = Array.from(
      element(fixture).querySelectorAll<HTMLElement>('[data-testid="first-person-effects"] table-effect-overlay > div')
    );
    expect(sprites.length).toBeGreaterThan(0);
    expect(sprites.some((sprite) => sprite.style.transform.includes('rotateZ(90deg) rotateX(-90deg)'))).toBe(true);
    ObjectStore.instance.remove(preset);
    canvas.mockRestore();
  });

  it('shakes and burns the view as it would the table', () => {
    const preset = new EffectPreset();
    preset.kind = 'nova';
    preset.grade = 3;
    preset.durationMs = 5000;
    ObjectStore.instance.add(preset, false);
    lookOutOf(pieceAt(4, 7));
    const fixture = mount();

    TestBed.inject(EffectPlaybackService).play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'somewhere', x: 0, y: 0, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    expect(element(fixture).querySelector('.animate-effect-shake-hard')).not.toBeNull();
    expect(element(fixture).querySelector<HTMLElement>('.animate-effect-flash')?.style.background).toContain('#ffd27f');
    ObjectStore.instance.remove(preset);
  });

  it('fires at what is aimed at with enter, and gives the aiming up with escape', () => {
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    const preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 5000;
    ObjectStore.instance.add(preset, false);
    const enemy = pieceAt(4, 4);
    enemy.targeted = true;
    lookOutOf(pieceAt(4, 7));
    mount();
    const targeting = TestBed.inject(EffectTargetingService);
    const fire = vi.spyOn(TestBed.inject(EffectCastService), 'fire');

    targeting.begin(preset);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));

    expect(targeting.isPicking()).toBe(false);
    expect(TestBed.inject(FirstPersonService).showing()).toBe(true);

    targeting.begin(preset);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }));

    expect(targeting.isPicking()).toBe(false);
    expect(fire).toHaveBeenCalledWith(preset, [enemy], expect.anything());
    ObjectStore.instance.remove(preset);
    canvas.mockRestore();
  });

  it('keeps the controls out of the middle of the foot of the view, where the hotbar sits', () => {
    lookOutOf(pieceAt(4, 7));

    const controls = element(mount()).querySelector<HTMLElement>('[data-testid="first-person-controls"]')!;

    expect(controls.className).toContain('left-16');
    expect(controls.className).toContain('max-w-[calc(100%-16rem)]');
    expect(controls.className).not.toContain('inset-x-0');
    expect(controls.className).not.toContain('items-center');
  });

  it('lets the controls reach the corner of the mobile shell, where no rail of buttons stands beside them', () => {
    const mobile = TestBed.inject(MobileLayoutService);
    mobile.prefersDesktop.set(false);
    Object.defineProperty(mobile, 'isActive', { value: () => true, configurable: true });
    lookOutOf(pieceAt(4, 7));

    const controls = element(mount()).querySelector<HTMLElement>('[data-testid="first-person-controls"]')!;

    expect(controls.className).toContain('left-0');
    expect(controls.className).toContain('max-w-full');
    expect(controls.className).not.toContain('left-16');
  });

  it('keeps the compass and the map in the view on a narrow screen, out of the way at the top', () => {
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());

    for (const testId of ['first-person-compass', 'first-person-minimap']) {
      const widget = view.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      expect(widget.className).not.toContain('hidden');
      expect(widget.className).toContain('right-2');
    }
  });

  it('hangs the bars of a piece it can see under its name', () => {
    const enemy = pieceAt(4, 4);
    enemy.detailDataElement!.getFirstElementByName('HP')!.currentValue = 3;
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;
    const gauges = billboard.querySelectorAll<HTMLElement>('[data-testid="first-person-gauge"]');

    expect(gauges.length).toBeGreaterThan(0);
    expect(gauges[0].textContent).toContain('3/');
  });

  it('keeps back the readings of a piece that is not the reader to look at', () => {
    const enemy = pieceAt(4, 4);
    enemy.owner = 'somebody-else';
    enemy.disclosureMode = DisclosureMode.GameMaster;
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-gauge"]')?.textContent).toContain('???/???');
  });

  it('pulls a piece on the next cell down to fit the frame, and leaves one four cells off alone', () => {
    const near = pieceAt(4, 6);
    const far = pieceAt(4, 3);
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());
    const billboardOf = (piece: GameCharacter) =>
      view.querySelector<HTMLElement>(`[data-piece="${piece.identifier}"]`)!;
    const heightOf = (piece: GameCharacter) => parseFloat(billboardOf(piece).style.height);

    expect(heightOf(far)).toBeCloseTo(GRID * 1.5 * scaleOf(GRID), 1);
    expect(heightOf(near)).toBeLessThan(heightOf(far));
  });

  it('holds the writing on a near piece to a size that can be read, and asks nothing of a far one', () => {
    const near = pieceAt(4, 6);
    const far = pieceAt(4, 3);
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());
    const chromeOf = (piece: GameCharacter) =>
      view.querySelector<HTMLElement>(`[data-piece="${piece.identifier}"] [data-testid="first-person-piece-chrome"]`)!;

    expect(chromeOf(near).style.transform).toMatch(/^scale\(0\./);
    expect(chromeOf(far).style.transform).toBe('');
  });

  it('stands the marks a piece carries along the top of it, with the rounds they have left', () => {
    const enemy = pieceAt(4, 4);
    enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-buff"]')).not.toBeNull();
    expect(billboard.querySelector('[data-testid="first-person-buff-rounds"]')?.textContent?.trim()).toBe('2');
  });

  it('leaves the marks off a piece that keeps them to itself', () => {
    const enemy = pieceAt(4, 4);
    enemy.hideBuff = true;
    enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-buff"]')).toBeNull();
  });

  describe('the light the piece carries', () => {
    function torchOf(fixture: ComponentFixture<FirstPersonViewComponent>): HTMLButtonElement {
      return element(fixture).querySelector<HTMLButtonElement>('[data-testid="first-person-torch"]')!;
    }

    it('strikes and puts out the light from the second row of the controls', () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      const fixture = mount();

      expect(torchOf(fixture).disabled).toBe(false);
      expect(torchOf(fixture).textContent).toContain('明かりを灯す');

      torchOf(fixture).click();
      TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
      fixture.detectChanges();

      expect(piece.lightEnabled).toBe(true);
      expect(torchOf(fixture).textContent).toContain('明かりを消す');
    });

    it('strikes the light with F as well', () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      mount();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));

      expect(piece.lightEnabled).toBe(true);
    });

    it('stands the button down for a seat that may not walk the piece', () => {
      const piece = pieceAt(4, 7);
      piece.isLock = true;
      lookOutOf(piece);

      expect(torchOf(mount()).disabled).toBe(true);
    });
  });

  describe('the light falling on the ground', () => {
    function veilOf(view: HTMLElement, col: number, row: number): number {
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      const quad = view.querySelector<HTMLElement>(`[data-quad="floor"][data-cell="${cellIndexOf(grid, col, row)}"]`)!;
      return Number(/rgba\(0, 0, 0, ([0-9.]+)\)/.exec(quad.style.backgroundImage)![1]);
    }

    it('draws ground a lamp lights brighter than ground as far off that it does not', () => {
      table.darknessEnabled = true;
      table.globalIllumination = 0;
      const lamp = LightSource.create('灯り');
      lamp.location = { name: 'table', x: 3 * GRID, y: 4 * GRID };
      lamp.lightBrightRadius = 0.5;
      lamp.lightDimRadius = 1;
      table.appendChild(lamp);
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      lookOutOf(pieceAt(4, 7));

      const view = element(mount());

      expect(veilOf(view, 3, 4)).toBeLessThan(veilOf(view, 5, 4));
    });
  });

  describe('ground the party only remembers', () => {
    function inTheDarkWithALampAt(col: number, row: number): void {
      table.darknessEnabled = true;
      table.globalIllumination = 0;
      table.fogEnabled = true;
      const memory = new FogMemory();
      memory.initialize();
      table.appendChild(memory);
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      const walked = new CellBits(grid.cols * grid.rows);
      for (let cell = 0; cell < walked.count; cell++) walked.set(cell);
      memory.write(grid, walked);
      const lamp = LightSource.create('灯り');
      lamp.location = { name: 'table', x: col * GRID, y: row * GRID };
      lamp.lightBrightRadius = 2;
      lamp.lightDimRadius = 2;
      table.appendChild(lamp);
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);
    }

    function floorAt(view: HTMLElement, col: number, row: number): HTMLElement {
      const grid = cellGridOf(table.width, table.height, GRID, GridType.SQUARE);
      return view.querySelector<HTMLElement>(`[data-quad="floor"][data-cell="${cellIndexOf(grid, col, row)}"]`)!;
    }

    function veils(quad: HTMLElement): number {
      return quad.style.backgroundImage.split('linear-gradient').length - 1;
    }

    it('draws it behind a veil, and the ground in sight without one', () => {
      inTheDarkWithALampAt(4, 7);
      lookOutOf(pieceAt(4, 7, 90));

      const view = element(mount());
      const lit = floorAt(view, 5, 7);
      const remembered = floorAt(view, 7, 7);

      expect(lit).not.toBeNull();
      expect(remembered).not.toBeNull();
      expect(lit.hasAttribute('data-remembered')).toBe(false);
      expect(remembered.getAttribute('data-remembered')).toBe('true');
      expect(veils(remembered)).toBe(veils(lit) + 1);
      expect(remembered.style.backgroundImage).toContain(`rgba(0, 0, 0, ${FOG_VEIL_ALPHA})`);
    });

    it('leaves every quad unveiled on a table nobody has to remember', () => {
      lookOutOf(pieceAt(4, 7, 90));

      const quads = Array.from(element(mount()).querySelectorAll('[data-quad]'));

      expect(quads.length).toBeGreaterThan(0);
      expect(quads.some((quad) => quad.hasAttribute('data-remembered'))).toBe(false);
    });
  });

  describe('what a piece in the view carries', () => {
    function enemyWithGauges(count: number): GameCharacter {
      const enemy = pieceAt(4, 4);
      for (let index = 0; index < count; index++) {
        const resource = DataElement.create(`資源${index}`, 10, { type: DataElementType.NUMBER_RESOURCE }, '10');
        resource.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
        enemy.detailDataElement!.appendChild(resource);
      }
      return enemy;
    }

    it('hangs no more bars on it than the table hangs round it', () => {
      const enemy = enemyWithGauges(MAX_MULTI_ANGLE_RESOURCE_GAUGES + 3);
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelectorAll('[data-testid="first-person-gauge"]')).toHaveLength(
        MAX_MULTI_ANGLE_RESOURCE_GAUGES
      );
    });

    it('stands its marks in one row and counts the rest off on a chip', () => {
      const enemy = pieceAt(4, 4);
      for (let index = 0; index < 8; index++) {
        enemy.buffDataElement!.appendChild(
          DataElement.create(`加護${index}`, 2, { type: DataElementType.NUMBER_RESOURCE })
        );
      }
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelectorAll('[data-testid="first-person-buff"]')).toHaveLength(5);
      expect(billboard.querySelector('[data-testid="first-person-buff-more"]')?.textContent?.trim()).toBe('あと3個');
    });

    it('leaves the chip off a piece whose marks all fit', () => {
      const enemy = pieceAt(4, 4);
      enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelector('[data-testid="first-person-buff-more"]')).toBeNull();
    });
  });

  it('draws the line from the caster to what is being picked, as the table does', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('effect-target-overlay')).not.toBeNull();
  });

  it('acts as the piece it looks out of, so an effect is cast from there', () => {
    const viewer = pieceAt(4, 7);
    lookOutOf(viewer);
    mount();
    TestBed.tick();

    expect(TestBed.inject(SelectionSignalService).selectedObject()?.identifier).toBe(viewer.identifier);
  });

  describe('while the view glides to where the piece now faces', () => {
    const grid = cellGridOf(12, 12, GRID, GridType.SQUARE);

    beforeEach(() => {
      TestBed.inject(MotionService).setting.set('on');
    });

    function drawsCell(fixture: ComponentFixture<FirstPersonViewComponent>, col: number, row: number): boolean {
      return element(fixture).querySelector(`[data-cell="${cellIndexOf(grid, col, row)}"]`) !== null;
    }

    it('goes on drawing the ground it is turning away from', async () => {
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
      corridor();
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      expect(drawsCell(fixture, 4, 3)).toBe(true);

      await TestBed.inject(FirstPersonService).turn(1);
      fixture.detectChanges();

      expect(drawsCell(fixture, 4, 3)).toBe(true);
    });
  });

  describe('range areas on the floor', () => {
    function rangeAt(col: number, row: number): RangeArea {
      const range = RangeArea.create('範囲', 1, 1, 50);
      range.type = 'CIRCLE';
      range.location = { name: 'table', x: col * GRID, y: row * GRID };
      return range;
    }

    it('lays a range ahead of the piece on the floor', () => {
      corridor();
      lookOutOf(pieceAt(4, 7));
      rangeAt(4, 4);

      expect(element(mount()).querySelectorAll('[data-range] first-person-range')).toHaveLength(1);
    });

    it('leaves out a range behind the piece', () => {
      corridor();
      lookOutOf(pieceAt(4, 7));
      rangeAt(4, 11);

      expect(element(mount()).querySelectorAll('[data-range]')).toHaveLength(0);
    });
  });
});
