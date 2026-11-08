import { DrawnKinds } from '@axe/infrastructure/table-3d/drawn-kinds';
import { BoxGeometry, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Scene } from 'three/webgpu';
import { describe, expect, it } from 'vitest';

describe('the kinds of thing a scene draws', () => {
  function scene(...things: Mesh[]): Scene {
    const made = new Scene();
    for (const thing of things) made.add(thing);
    return made;
  }

  it('hands back each kind of thing drawn until it is marked readied, and not again', () => {
    const kinds = new DrawnKinds();
    const board = new Mesh(new PlaneGeometry(1, 1), new MeshBasicNodeMaterial());
    const drawn = scene(board);

    const fresh = kinds.unreadied(drawn);
    expect(fresh.kinds).toHaveLength(1);
    expect(fresh.things).toEqual([board]);

    kinds.markReadied(fresh.kinds);

    expect(kinds.unreadied(drawn).kinds).toEqual([]);
  });

  it('takes a new thing drawn as one already readied for as nothing new', () => {
    const kinds = new DrawnKinds();
    const look = new MeshBasicNodeMaterial();
    const drawn = scene(new Mesh(new PlaneGeometry(1, 1), look));
    kinds.markReadied(kinds.unreadied(drawn).kinds);

    drawn.add(new Mesh(new PlaneGeometry(2, 2), look));

    expect(kinds.unreadied(drawn)).toEqual({ kinds: [], things: [] });
  });

  it('hands back a thing again once its material has changed, or once it throws a shadow', () => {
    const kinds = new DrawnKinds();
    const look = new MeshBasicNodeMaterial();
    const piece = new Mesh(new PlaneGeometry(1, 1), look);
    const drawn = scene(piece);
    kinds.markReadied(kinds.unreadied(drawn).kinds);

    look.needsUpdate = true;
    expect(kinds.unreadied(drawn).kinds).toHaveLength(1);
    kinds.markReadied(kinds.unreadied(drawn).kinds);

    piece.castShadow = true;
    expect(kinds.unreadied(drawn).kinds).toHaveLength(1);
  });

  it('hands back a thing given a geometry that carries something else', () => {
    const kinds = new DrawnKinds();
    const piece = new Mesh(new PlaneGeometry(1, 1), new MeshBasicNodeMaterial());
    const drawn = scene(piece);
    kinds.markReadied(kinds.unreadied(drawn).kinds);
    const box = new BoxGeometry(1, 1, 1);
    box.setAttribute('color', box.getAttribute('normal').clone());

    piece.geometry = box;

    expect(kinds.unreadied(drawn).kinds).toHaveLength(1);
  });

  it('leaves out what is not drawn, hidden or holding nothing to draw', () => {
    const kinds = new DrawnKinds();
    const hidden = new Mesh(new PlaneGeometry(1, 1), new MeshBasicNodeMaterial());
    hidden.visible = false;
    const drawn = scene(hidden);
    drawn.add(new Group());

    expect(kinds.unreadied(drawn).kinds).toEqual([]);
  });
});
