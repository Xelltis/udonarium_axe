import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_DESERIALIZE_SCENE, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { ImageLayer } from '@axe/domain/map-editor/scene';
import { serializeScene } from '@axe/domain/map-editor/serialize';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { AnimatedImageService } from '@axe/features/tabletop/white-board/animated-image.service';
import { WhiteBoardComponent } from '@axe/features/tabletop/white-board/white-board.component';
import { createBoardScene } from '@axe/features/tabletop/white-board/white-board-scene';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';

describe('WhiteBoardComponent', () => {
  let fixture: ComponentFixture<WhiteBoardComponent>;
  let component: WhiteBoardComponent;
  let table: GameTable;
  let board: WhiteBoard;

  function place(x: number, y: number, surface?: string): GameCharacter {
    const piece = GameCharacter.create('piece', 1, '');
    piece.location = surface ? { name: 'table', x, y, surface } : { name: 'table', x, y };
    return piece;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [WhiteBoardComponent],
      providers: [...TEST_PROVIDERS, { provide: TRANSLATE_FN, useValue: (key: string) => key }],
    }).compileComponents();

    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    board = WhiteBoard.create('board', 6, 4, 1);
    board.location = { name: 'table', x: 100, y: 200 };
    table.appendChild(board);

    fixture = TestBed.createComponent(WhiteBoardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('whiteBoard', board);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('opens its details from the face lying over it, which is what a pointer on the board is over', () => {
    fixture.detectChanges();

    const triggers = fixture.debugElement.queryAll(By.directive(TooltipDirective));
    const own = triggers.filter((trigger) => trigger.injector.get(TooltipDirective).tabletopObject() === board);
    expect(own).toHaveLength(1);
    expect((own[0].nativeElement as HTMLElement).getAttribute('data-surface')).toBe(board.identifier);
  });

  it('wears a picture that arrived after the board did, without the board being moved', () => {
    // The bytes of a picture follow the name of it, so the arrival has to move the view too;
    // otherwise the board would stand blank for everybody else until somebody dragged it.
    const before = component.imageUrl();

    const element = board.imageDataElement?.getFirstElementByName('imageIdentifier');
    element!.value = 'board-picture';
    ImageStorage.instance.add(
      ImageFile.create({
        identifier: 'board-picture',
        name: 'test-board',
        type: 'image/png',
        blob: null,
        url: './assets/images/test-board.png',
        thumbnail: { type: '', blob: null, url: '' },
      })
    );
    TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);

    expect(component.imageUrl()).not.toBe(before);
    expect(component.imageUrl()).toContain('test-board');
  });

  it('parses its drawing only when the drawing itself changes', async () => {
    perfCounters.enabled = true;
    perfCounters.clear();
    component.livePictures();

    board.pitch = 45;
    await new Promise((resolve) => setTimeout(resolve, 20));
    component.livePictures();
    expect(perfCounters.drain().get(PERF_DESERIALIZE_SCENE)).toBe(1);

    board.scene = serializeScene(createBoardScene(6, 4, 50));
    await new Promise((resolve) => setTimeout(resolve, 20));
    component.livePictures();
    expect(perfCounters.drain().get(PERF_DESERIALIZE_SCENE)).toBe(1);
    perfCounters.enabled = false;
  });

  it('hangs a picture that was only known to move after the drawing was read', async () => {
    const image = ImageStorage.instance.add('test://white-board/live.gif');
    const scene = createBoardScene(6, 4, 50);
    const layer: ImageLayer = {
      id: 'pictures',
      kind: 'image',
      name: 'pictures',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: 'item-0',
          imageIdentifier: image.identifier,
          x: 0,
          y: 0,
          w: 60,
          h: 40,
          rotation: 0,
          opacity: 1,
        },
      ],
    };
    scene.layers = [layer];
    board.scene = serializeScene(scene);
    await new Promise((resolve) => setTimeout(resolve, 20));

    let moves = false;
    vi.spyOn(TestBed.inject(AnimatedImageService), 'isAnimated').mockImplementation(() => moves);
    expect(component.livePictures()).toEqual([]);

    moves = true;
    board.update();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(component.livePictures().map((picture) => picture.imageIdentifier)).toEqual([image.identifier]);
  });

  it('hangs its moving pictures in a box not drawn from behind, and takes presses on its face from either side', async () => {
    const image = ImageStorage.instance.add('test://white-board/back.gif');
    const scene = createBoardScene(6, 4, 50);
    const layer: ImageLayer = {
      id: 'pictures',
      kind: 'image',
      name: 'pictures',
      visible: true,
      locked: false,
      opacity: 1,
      items: [{ id: 'item-0', imageIdentifier: image.identifier, x: 0, y: 0, w: 60, h: 40, rotation: 0, opacity: 1 }],
    };
    scene.layers = [layer];
    vi.spyOn(TestBed.inject(AnimatedImageService), 'isAnimated').mockReturnValue(true);
    board.scene = serializeScene(scene);
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const live = host.querySelector<HTMLElement>('[data-testid="white-board-live-pictures"]')!;
    expect(live.classList.contains('backface-hidden')).toBe(true);
    expect(live.classList.contains('pointer-events-none')).toBe(true);
    expect([live.style.width, live.style.height]).toEqual(['300px', '200px']);
    const hung = [...host.querySelectorAll<HTMLImageElement>('img')].filter((img) => img.src.includes('back.gif'));
    expect(hung).toHaveLength(1);
    expect(hung[0].parentElement).toBe(live);

    const face = host.querySelector<HTMLElement>('[data-surface]')!;
    expect(face.contains(live)).toBe(false);
    expect(face.classList.contains('pointer-events-auto')).toBe(true);
    expect(face.classList.contains('backface-hidden')).toBe(false);
    expect(face.querySelector('.backface-hidden')).toBeNull();
  });

  it('is the size it was given, in pixels', () => {
    expect(component.widthPx()).toBe(6 * 50);
    expect(component.heightPx()).toBe(4 * 50);
  });

  it('takes the turn it was dragged to, so the board keeps facing where it was left', () => {
    component.onRotated(30);

    expect(board.rotate).toBe(30);
  });

  /** Opens the board's menu as a right click on it does, and hands back what it offers. */
  function openMenu(): ContextMenuAction[] {
    vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    component.onContextMenu(new MouseEvent('contextmenu'));
    return open.mock.calls.at(-1)![1];
  }

  function entry(menu: ContextMenuAction[], key: string): ContextMenuAction | undefined {
    return menu.find((action) => action.name === key);
  }

  it('offers to take everything off only while something names it as the face it stands on', () => {
    place(10, 10);
    place(10, 10, 'north-wall');
    expect(entry(openMenu(), 'feature.whiteBoard.contextMenu.detachAll')).toBeUndefined();

    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: -40, y: 260, surface: board.identifier };

    expect(entry(openMenu(), 'feature.whiteBoard.contextMenu.detachAll')).toBeDefined();
  });

  it('holds terrain as well as pieces', () => {
    const terrain = Terrain.create('rock', 1, 1, 1, '', '');
    terrain.location = { name: 'table', x: 0, y: 0, surface: board.identifier };
    table.appendChild(terrain);

    expect(entry(openMenu(), 'feature.whiteBoard.contextMenu.detachAll')).toBeDefined();
  });

  it('puts everything back where it appeared to be when the board is cleared', () => {
    const piece = place(50, 40, board.identifier);
    const light = LightSource.create('light');
    light.location = { name: 'table', x: 10, y: 20, surface: board.identifier };

    entry(openMenu(), 'feature.whiteBoard.contextMenu.detachAll')!.action!();

    expect([piece.location.surface, piece.location.x, piece.location.y]).toEqual([undefined, 150, 240]);
    expect([light.location.surface, light.location.x, light.location.y]).toEqual([undefined, 110, 220]);
  });

  it('puts a coin and a light set on it back on the table where they appeared to be when it is deleted', () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 30, y: 40, surface: board.identifier };
    const light = LightSource.create('light');
    light.location = { name: 'table', x: 10, y: 20, surface: board.identifier };

    entry(openMenu(), 'feature.whiteBoard.contextMenu.delete')!.action!();

    expect(ObjectStore.instance.get(board.identifier)).toBeNull();
    expect([coin.location.surface, coin.location.x, coin.location.y]).toEqual([undefined, 130, 240]);
    expect([light.location.surface, light.location.x, light.location.y]).toEqual([undefined, 110, 220]);
  });

  it('fades only the face, so what is drawn on the board floats over it', () => {
    board.opacity = 0.2;
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const faded = host.querySelectorAll<HTMLElement>('[style*="opacity"]');

    // The face may be faded to nothing; a plan drawn on it still reads at its own weight.
    expect(faded.length).toBeGreaterThan(0);
    for (const element of faded) {
      expect(element.style.backgroundImage).toBe('');
    }
  });
});
