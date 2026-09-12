import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { FirstPersonViewComponent } from '@axe/features/first-person/first-person-view/first-person-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
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

  it('acts as the piece it looks out of, so an effect is cast from there', () => {
    const viewer = pieceAt(4, 7);
    lookOutOf(viewer);
    mount();
    TestBed.tick();

    expect(TestBed.inject(SelectionSignalService).selectedObject()?.identifier).toBe(viewer.identifier);
  });
});
