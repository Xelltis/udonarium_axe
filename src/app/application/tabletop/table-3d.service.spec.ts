import { TestBed } from '@angular/core/testing';
import { TABLE_3D_ENGINES, TABLE_GRAPHICS, Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TableGraphics } from '@axe/core/util/graphics-acceleration';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import type { TableWorld } from '@axe/domain/tabletop/world/table-world';
import type { Table3dCamera, Table3dEngine, Table3dEngineOptions } from '@axe/infrastructure/table-3d/table-3d-port';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** An engine that keeps what it is told and counts what it draws. */
class FakeEngine implements Table3dEngine {
  readonly backend: 'webgpu' | 'webgl2';
  worlds: TableWorld[] = [];
  cameras: Table3dCamera[] = [];
  sizes: [number, number][] = [];
  drawn = 0;
  disposed = false;
  lose: () => void = () => undefined;
  private changed = false;

  constructor(readonly options: Table3dEngineOptions) {
    this.backend = options.forceWebGL ? 'webgl2' : 'webgpu';
  }

  setWorld(world: TableWorld): void {
    this.worlds.push(world);
    this.changed = true;
  }

  setCamera(camera: Table3dCamera): void {
    this.cameras.push(camera);
    this.changed = true;
  }

  resize(width: number, height: number): void {
    this.sizes.push([width, height]);
  }

  renderIfChanged(): boolean {
    if (!this.changed) return false;
    this.changed = false;
    this.drawn++;
    return true;
  }

  dispose(): void {
    this.disposed = true;
  }

  onLost(listener: () => void): void {
    this.lose = listener;
  }
}

describe('Table3dService', () => {
  let engines: FakeEngine[];
  let graphics: TableGraphics;
  /** How many times the engine was loaded for the service made last; each service counts its own. */
  let loaded: { count: number };

  function service(): Table3dService {
    engines = [];
    const counted = { count: 0 };
    loaded = counted;
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: TABLE_3D_ENGINES,
          useValue: () => {
            counted.count++;
            return Promise.resolve({
              createTable3dEngine: (_canvas: HTMLCanvasElement, options: Table3dEngineOptions) => {
                const engine = new FakeEngine(options);
                engines.push(engine);
                return Promise.resolve(engine);
              },
            });
          },
        },
        { provide: TABLE_GRAPHICS, useValue: () => Promise.resolve(graphics) },
      ],
    });
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout({ left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 750 });
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    return TestBed.inject(Table3dService);
  }

  beforeEach(() => {
    graphics = { webgpu: true, webgl2: true };
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEYS.tableRenderer));

  it('draws with the page until a seat asks for a canvas, and remembers the choice', () => {
    const scene = service();
    expect(scene.renderer()).toBe('css');
    expect(scene.drawsOnCanvas()).toBe(false);

    scene.choose('three');

    expect(scene.drawsOnCanvas()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.tableRenderer)).toBe('three');
  });

  it('takes up the choice this browser remembers, and leaves one it does not know', () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three-webgl2');
    expect(service().renderer()).toBe('three-webgl2');

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'something else');
    expect(service().renderer()).toBe('css');
  });

  it('draws the scene and the camera on the frame after it is given a canvas, and once only', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    const engine = engines[0];
    expect(scene.backend()).toBe('webgpu');
    expect(engine.options.forceWebGL).toBe(false);
    expect(engine.worlds.at(-1)).toBe(scene.world());
    expect(engine.cameras.at(-1)).toMatchObject({ width: 1280, height: 800, orthographic: false });
    expect(engine.sizes).toEqual([[1280, 800]]);
    expect(engine.drawn).toBe(1);
  });

  it('draws again when the camera moves, and not otherwise', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    TestBed.inject(TableCameraService).showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 40 });
    TestBed.tick();
    await scene.whenIdle();
    TestBed.tick();
    await scene.whenIdle();

    expect(engines[0].drawn).toBe(2);
  });

  it('draws through WebGL2 where it is asked to, or where WebGPU cannot be had', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three-webgl2');
    const asked = service();
    asked.attach(document.createElement('canvas'));
    await asked.whenIdle();
    expect(engines[0].options.forceWebGL).toBe(true);

    TestBed.resetTestingModule();
    localStorage.removeItem(STORAGE_KEYS.tableRenderer);
    graphics = { webgpu: false, webgl2: true };
    const without = service();
    without.attach(document.createElement('canvas'));
    await without.whenIdle();
    expect(engines[0].options.forceWebGL).toBe(true);
  });

  it('says so, and makes no engine, where neither interface can be had', async () => {
    graphics = { webgpu: false, webgl2: false };
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(scene.unavailable()).toBe(true);
    expect(engines).toHaveLength(0);
  });

  it('lets the canvas go when it is taken away', async () => {
    const scene = service();
    const detach = scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    detach();

    expect(engines[0].disposed).toBe(true);
    expect(scene.backend()).toBeNull();
  });

  it('has a fresh canvas made when the graphics card lets the drawing go, a few times at most', async () => {
    const scene = service();
    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    engines[0].lose();

    expect(scene.backend()).toBeNull();
    expect(scene.canvasGeneration()).toBe(1);
    for (let again = 0; again < 5; again++) engines[0].lose();
    expect(scene.canvasGeneration()).toBe(3);
  });

  it('loads the engine while the page is idle for a seat that draws on a canvas, and not for one that does not', async () => {
    service();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loaded.count).toBe(0);

    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three');
    service();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(loaded.count).toBe(1);
  });

  it('is preparing from when the canvas is asked for until it draws', async () => {
    localStorage.setItem(STORAGE_KEYS.tableRenderer, 'three');
    const scene = service();
    expect(scene.preparing()).toBe(true);

    scene.attach(document.createElement('canvas'));
    await scene.whenIdle();

    expect(scene.preparing()).toBe(false);
  });
});
