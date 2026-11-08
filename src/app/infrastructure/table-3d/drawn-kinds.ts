import type { BufferGeometry, Material, Object3D } from 'three/webgpu';

/** What a thing was last looked at with, and the kind it came to. */
interface Seen {
  readonly material: Material;
  readonly version: number;
  readonly geometry: BufferGeometry;
  readonly castShadow: boolean;
  readonly kind: string;
}

type Drawable = Object3D & {
  readonly isMesh?: boolean;
  readonly isSprite?: boolean;
  readonly isPoints?: boolean;
  readonly isLine?: boolean;
  readonly material?: Material | Material[];
  readonly geometry?: BufferGeometry;
};

/**
 * The kinds of thing a scene draws, by what the graphics card builds to draw each: its material as it
 * stands, what its geometry carries, what it is and whether it throws a shadow. Kinds marked readied
 * are not handed back again, so the card can be readied for a new kind before the frame that first
 * draws it, rather than building it on that frame and holding the page up meanwhile.
 */
export class DrawnKinds {
  private readonly seen = new WeakMap<Object3D, Seen[]>();
  private readonly readied = new Set<string>();

  /**
   * The kinds the visible things of the scene are drawn as that have not been marked readied, and the
   * things drawn as them.
   */
  unreadied(scene: Object3D): { readonly kinds: string[]; readonly things: Object3D[] } {
    const fresh = new Set<string>();
    const things: Object3D[] = [];
    scene.traverseVisible((object) => {
      const drawn = object as Drawable;
      if (!(drawn.isMesh || drawn.isSprite || drawn.isPoints || drawn.isLine)) return;
      const { material, geometry } = drawn;
      if (!material || !geometry) return;
      const materials = Array.isArray(material) ? material : [material];
      let isNew = false;
      materials.forEach((one, index) => {
        const kind = this.kindOf(object, one, geometry, index);
        if (this.readied.has(kind)) return;
        fresh.add(kind);
        isNew = true;
      });
      if (isNew) things.push(object);
    });
    return { kinds: [...fresh], things };
  }

  /** Marks kinds as readied, so they are not handed back again. */
  markReadied(kinds: readonly string[]): void {
    for (const kind of kinds) this.readied.add(kind);
  }

  private kindOf(object: Object3D, material: Material, geometry: BufferGeometry, index: number): string {
    const kept = this.seen.get(object);
    const known = kept?.[index];
    if (
      known &&
      known.material === material &&
      known.version === material.version &&
      known.geometry === geometry &&
      known.castShadow === object.castShadow
    ) {
      return known.kind;
    }
    const carried = Object.keys(geometry.attributes).sort().join(',');
    const kind = `${material.id}:${material.version}:${object.type}:${object.castShadow ? 1 : 0}:${carried}`;
    const seen = kept ?? [];
    seen[index] = { material, version: material.version, geometry, castShadow: object.castShadow, kind };
    if (!kept) this.seen.set(object, seen);
    return kind;
  }
}
