import { ReadiedDrawing, type ReadyingRenderer } from '@axe/infrastructure/table-3d/readied-drawing';
import { BoxGeometry, Mesh, MeshBasicMaterial, type Object3D, PerspectiveCamera, Scene } from 'three/webgpu';

/** A renderer that builds a thing only when told to finish, and keeps what it was asked. */
class SlowRenderer implements ReadyingRenderer {
  readonly built: Object3D[] = [];
  drawn = 0;
  private waiting: (() => void)[] = [];

  render(): void {
    this.drawn++;
  }

  compileAsync(thing: Object3D): Promise<void> {
    this.built.push(thing);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  /** Finishes every building asked for so far, and lets what follows from it run. */
  async finish(): Promise<void> {
    for (const done of this.waiting.splice(0)) done();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('ReadiedDrawing', () => {
  const camera = new PerspectiveCamera();
  let scene: Scene;
  let renderer: SlowRenderer;
  let drawing: ReadiedDrawing;
  const box = () => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());

  beforeEach(() => {
    scene = new Scene();
    renderer = new SlowRenderer();
    drawing = new ReadiedDrawing(renderer, scene, camera);
  });

  it('draws at once a scene with nothing new to the card', () => {
    drawing.draw();
    expect(renderer.drawn).toBe(1);
    expect(renderer.built).toEqual([]);
  });

  it('builds a kind new to the card before the scene is drawn, and draws once however often it was asked meanwhile', async () => {
    const thing = box();
    scene.add(thing);

    drawing.draw();
    drawing.draw();
    drawing.draw();
    expect(renderer.built).toEqual([thing]);
    expect(renderer.drawn).toBe(0);

    await renderer.finish();
    expect(renderer.drawn).toBe(1);

    drawing.draw();
    expect(renderer.drawn).toBe(2);
    expect(renderer.built).toEqual([thing]);
  });

  it('says a drawing is still to come from when it is asked for until it is drawn, and never for readying alone', async () => {
    expect(drawing.waiting).toBe(false);
    scene.add(box());
    drawing.ready();
    expect(drawing.waiting).toBe(false);

    drawing.draw();
    expect(drawing.waiting).toBe(true);

    await renderer.finish();
    expect(renderer.drawn).toBe(1);
    expect(drawing.waiting).toBe(false);

    scene.add(box());
    drawing.draw();
    drawing.dispose();
    expect(drawing.waiting).toBe(false);
  });

  it('readies the whole scene at once where more than a few things are new to the card', async () => {
    const colours = Array.from({ length: 25 }, (_, index) => index);
    for (const colour of colours)
      scene.add(
        new Mesh(
          new BoxGeometry(1, 1, 1),
          new MeshBasicMaterial({
            color: colour,
            wireframe: colour % 2 === 0,
            transparent: colour % 3 === 0,
            opacity: 1 - colour / 100,
          })
        )
      );
    drawing.draw();

    expect(renderer.built).toEqual([scene]);
    await renderer.finish();
    expect(renderer.drawn).toBe(1);
  });

  it('builds what came into the scene while it was building before it draws', async () => {
    const first = box();
    const second = box();
    scene.add(first);
    drawing.draw();
    scene.add(second);

    await renderer.finish();
    expect(renderer.built).toEqual([first, second]);
    expect(renderer.drawn).toBe(0);

    await renderer.finish();
    expect(renderer.drawn).toBe(1);
  });

  it('readies ahead without drawing, so the first drawing does not wait', async () => {
    scene.add(box());
    drawing.ready();
    await renderer.finish();
    expect(renderer.drawn).toBe(0);

    drawing.draw();
    expect(renderer.drawn).toBe(1);
  });

  it('passes over a thing taken out of the scene before its turn, and builds it after all should it come back', async () => {
    const first = box();
    const second = box();
    scene.add(first, second);
    drawing.draw();
    scene.remove(second);

    // Not everything was built, so nothing is taken as readied yet: what is left is asked after again.
    await renderer.finish();
    expect(renderer.built).toEqual([first, first]);
    await renderer.finish();
    expect(renderer.drawn).toBe(1);

    scene.add(second);
    drawing.draw();
    expect(renderer.built).toEqual([first, first, second]);
    await renderer.finish();
    expect(renderer.drawn).toBe(2);
  });

  it('draws the scene as it stands once things new to the card have kept coming through three builds', async () => {
    scene.add(box());
    drawing.draw();
    for (let build = 0; build < 3; build++) {
      scene.add(box());
      await renderer.finish();
    }

    expect(renderer.drawn).toBe(1);
    expect(renderer.built).toHaveLength(3);
  });

  it('draws nothing once it is let go of, a building under way or not', async () => {
    scene.add(box());
    drawing.draw();
    drawing.dispose();
    await renderer.finish();
    drawing.draw();

    expect(renderer.drawn).toBe(0);
  });
});
