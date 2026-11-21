import { MODEL_FACE_AS_MADE, NO_SHAPE } from '@axe/domain/tabletop/model-face';
import { MADE_MOTION_MS, MADE_REST, MODEL_MOTIONS_AS_MADE, type ModelAct } from '@axe/domain/tabletop/model-motions';
import { type ActorMoment, ModelActor, posedPlacement } from '@axe/infrastructure/table-3d/model-actor';
import { AnimationClip, Group, Matrix4, Mesh, Vector3 } from 'three/webgpu';

const ASKED = { idle: '', walk: '', motions: MODEL_MOTIONS_AS_MADE, face: MODEL_FACE_AS_MADE };

function at(timeMs: number, fields: Partial<ActorMoment> = {}): ActorMoment {
  return { timeMs, moving: true, standing: true, ...fields };
}

function act(role: ModelAct['role'], atMs: number, fields: Partial<ModelAct> = {}): ModelAct {
  return { key: `${role}@${atMs}`, role, atMs, ...fields };
}

/** An actor on a model that has the motions named, each a second long, asked for the model's own. */
function actorWith(names: readonly string[], asked = ASKED): ModelActor {
  const actor = new ModelActor(
    new Group(),
    names.map((name) => new AnimationClip(name, 1, [])),
    'knight'
  );
  actor.cast(asked);
  return actor;
}

describe('ModelActor', () => {
  it('stands in its idle, walks while its piece is moved, and stands again after', () => {
    const actor = actorWith(['Idle', 'Walk']);

    expect(actor.advance(at(0))).toBe('slow');
    expect(actor.motion).toBe('Idle');

    actor.walk(true, 100);
    expect(actor.advance(at(100))).toBe('fast');
    expect(actor.motion).toBe('Walk');

    actor.walk(false, 400);
    expect(actor.advance(at(400))).toBe('slow');
    expect(actor.motion).toBe('Idle');
  });

  it('walks in its idle where it has no walk of its own, and plays nothing where it has no motion at all', () => {
    const standing = actorWith(['Idle']);
    standing.walk(true, 0);
    standing.advance(at(0));
    expect(standing.motion).toBe('Idle');

    const still = actorWith([]);
    expect(still.advance(at(0))).toBe('still');
    expect(still.motion).toBeNull();
  });

  it('plays the motions its piece names, and the others it names once they are changed', () => {
    const actor = actorWith(['Idle', 'Guard', 'Walk', 'Run'], { ...ASKED, idle: 'Guard' });
    actor.advance(at(0));
    expect(actor.motion).toBe('Guard');

    actor.cast({ ...ASKED, idle: 'Guard', walk: 'Run' });
    actor.walk(true, 10);
    actor.advance(at(10));
    expect(actor.motion).toBe('Run');
  });

  it('acts a blow once through, wanting every frame meanwhile, and stands again after', () => {
    const actor = actorWith(['Idle', 'Slash']);
    actor.advance(at(0));

    actor.perform(act('attack', 100));
    expect(actor.advance(at(100))).toBe('fast');
    expect(actor.motion).toBe('Slash');
    expect(actor.finishedAct).toBeNull();
    expect(actor.advance(at(600))).toBe('fast');

    expect(actor.advance(at(1200))).toBe('slow');
    expect(actor.motion).toBe('Idle');
    expect(actor.finishedAct?.key).toBe('attack@100');
  });

  it('plays the same act again only where it is asked for under another key', () => {
    const actor = actorWith(['Idle', 'Slash']);
    actor.perform(act('attack', 0));
    actor.advance(at(0));
    actor.advance(at(1100));
    expect(actor.motion).toBe('Idle');

    actor.perform(act('attack', 0));
    actor.advance(at(1200));
    expect(actor.motion).toBe('Idle');

    actor.perform(act('attack', 1300));
    actor.advance(at(1300));
    expect(actor.motion).toBe('Slash');
  });

  it('plays a motion asked for by name, and nothing for a name the model lacks', () => {
    const actor = actorWith(['Idle', 'Wave']);
    actor.perform(act('named', 0, { name: 'Wave' }));
    expect(actor.advance(at(0))).toBe('fast');
    expect(actor.motion).toBe('Wave');

    actor.perform(act('named', 50, { name: 'Dance' }));
    expect(actor.advance(at(50))).toBe('slow');
    expect(actor.motion).toBe('Idle');
    expect(actor.pose).toBe(MADE_REST);
  });

  it('stays down once its going down is through, and stands again once it is asked to no more', () => {
    const actor = actorWith(['Idle', 'Death']);
    actor.perform(act('defeat', 0));
    expect(actor.advance(at(0))).toBe('fast');
    expect(actor.advance(at(1500))).toBe('still');
    expect(actor.motion).toBe('Death');
    expect(actor.finishedAct).toBeNull();
    expect(actor.advance(at(9000))).toBe('still');

    actor.perform(null);
    expect(actor.advance(at(9100))).toBe('slow');
    expect(actor.motion).toBe('Idle');
  });

  it('joins an act where it has got to, passes over one long since through, and stands one long since down as it ended', () => {
    const late = actorWith(['Idle', 'Slash']);
    late.perform(act('attack', 0));
    expect(late.advance(at(400))).toBe('fast');
    expect(late.advance(at(1100))).toBe('slow');

    const missed = actorWith(['Idle', 'Slash']);
    missed.perform(act('attack', 0));
    expect(missed.advance(at(5000))).toBe('slow');
    expect(missed.motion).toBe('Idle');
    expect(missed.finishedAct?.key).toBe('attack@0');

    const found = actorWith(['Idle', 'Death']);
    found.perform(act('defeat', Number.NEGATIVE_INFINITY));
    expect(found.advance(at(5000))).toBe('still');
    expect(found.motion).toBe('Death');
  });

  it('plays an act on to its end once it is asked for no more, but stands one down up again at once', () => {
    const actor = actorWith(['Idle', 'Slash', 'Death']);
    actor.perform(act('attack', 0));
    actor.advance(at(0));
    actor.perform(null);
    expect(actor.advance(at(500))).toBe('fast');
    expect(actor.motion).toBe('Slash');
    expect(actor.advance(at(1100))).toBe('slow');
    actor.perform(null);
    expect(actor.finishedAct).toBeNull();

    actor.perform(act('defeat', 2000));
    actor.advance(at(2100));
    actor.perform(null);
    expect(actor.advance(at(2200))).toBe('slow');
    expect(actor.motion).toBe('Idle');
  });

  it('waits for an act yet to come, standing meanwhile and wanting every frame, and plays it from its start once it comes', () => {
    const actor = actorWith(['Idle', 'Flinch']);
    actor.perform(act('hit', 500));

    expect(actor.advance(at(100))).toBe('fast');
    expect(actor.motion).toBe('Idle');
    expect(actor.advance(at(520))).toBe('fast');
    expect(actor.motion).toBe('Flinch');
    expect(actor.advance(at(1400))).toBe('fast');
    expect(actor.advance(at(1600))).toBe('slow');
    expect(actor.motion).toBe('Idle');

    const moved = actorWith([]);
    moved.perform(act('hit', 500));
    moved.advance(at(100));
    expect(moved.pose).toBe(MADE_REST);
    moved.advance(at(500 + MADE_MOTION_MS.hit * 0.2));
    expect(moved.pose.forward).toBeLessThan(-0.2);
  });

  describe('with no motion of its own for a role', () => {
    it('is moved by hand through a blow, wanting every frame meanwhile, and stands as it was after', () => {
      const actor = actorWith([]);
      actor.perform(act('attack', 0));

      expect(actor.advance(at(MADE_MOTION_MS.attack * 0.46))).toBe('fast');
      expect(actor.pose.forward).toBeGreaterThan(0.4);

      expect(actor.advance(at(MADE_MOTION_MS.attack + 1))).toBe('still');
      expect(actor.pose).toBe(MADE_REST);
      expect(actor.finishedAct?.key).toBe('attack@0');
    });

    it('hops along while its piece is moved, and stands as it was once it is not', () => {
      const actor = actorWith([]);
      actor.walk(true, 1000);

      expect(actor.advance(at(1000 + MADE_MOTION_MS.walk / 2))).toBe('fast');
      expect(actor.pose.lift).toBeGreaterThan(0.1);

      actor.walk(false, 2000);
      expect(actor.advance(at(2000))).toBe('still');
      expect(actor.pose).toBe(MADE_REST);
    });

    it('goes down on its back and stays there', () => {
      const actor = actorWith(['Idle']);
      actor.perform(act('defeat', 0));
      actor.advance(at(0));

      expect(actor.advance(at(MADE_MOTION_MS.defeat + 500))).toBe('still');
      expect(actor.pose.pitchDeg).toBeLessThan(-80);
      expect(actor.advance(at(60_000))).toBe('still');
      expect(actor.pose.pitchDeg).toBeLessThan(-80);
    });

    it('is not moved by hand where its piece has turned that off, nor for a role it has a motion for', () => {
      const unmoved = actorWith([], { ...ASKED, motions: { ...MODEL_MOTIONS_AS_MADE, made: false } });
      unmoved.perform(act('attack', 0));
      unmoved.walk(true, 0);
      expect(unmoved.advance(at(200))).toBe('fast');
      expect(unmoved.pose).toBe(MADE_REST);
      expect(unmoved.finishedAct?.key).toBe('attack@0');

      const played = actorWith(['Slash', 'Walk']);
      played.perform(act('attack', 0));
      played.walk(true, 0);
      played.advance(at(200));
      expect(played.pose).toBe(MADE_REST);
    });
  });

  describe('for a reader who asks for less motion', () => {
    it('holds the first pose of its idle and wants no frame', () => {
      const actor = actorWith(['Idle', 'Walk']);
      actor.walk(true, 0);

      expect(actor.advance(at(0, { moving: false }))).toBe('still');
      expect(actor.advance(at(500, { moving: false }))).toBe('still');
    });

    it('passes over a blow, and stands one down as its going down ends', () => {
      const struck = actorWith([]);
      struck.perform(act('hit', 0));
      expect(struck.advance(at(100, { moving: false }))).toBe('still');
      expect(struck.pose).toBe(MADE_REST);

      const down = actorWith([]);
      down.perform(act('defeat', 0));
      expect(down.advance(at(100, { moving: false }))).toBe('still');
      expect(down.pose.pitchDeg).toBeLessThan(-80);
    });
  });

  it('holds the first pose of its idle where standing motions are not played, but still walks and acts', () => {
    const actor = actorWith(['Idle', 'Walk', 'Slash']);
    const plain = { standing: false };

    expect(actor.advance(at(0, plain))).toBe('still');
    actor.walk(true, 100);
    expect(actor.advance(at(100, plain))).toBe('fast');
    actor.walk(false, 200);
    expect(actor.advance(at(200, plain))).toBe('still');
    expect(actor.motion).toBe('Idle');
    actor.perform(act('attack', 300));
    expect(actor.advance(at(300, plain))).toBe('fast');
  });

  describe('with shapes to be blended towards', () => {
    function faced(names: readonly string[]) {
      const mesh = new Mesh();
      mesh.morphTargetInfluences = names.map(() => 0);
      mesh.morphTargetDictionary = Object.fromEntries(names.map((name, index) => [name, index]));
      const root = new Group();
      root.add(mesh);
      return { actor: new ModelActor(root, [], 'knight'), influences: mesh.morphTargetInfluences };
    }

    it('names its shapes, and those a mesh read with none carries with its shape', () => {
      expect(faced(['Blink', 'Joy']).actor.shapes).toEqual(['Blink', 'Joy']);

      const mesh = new Mesh();
      mesh.morphTargetInfluences = [0, 0];
      mesh.morphTargetDictionary = { '0': 0, '1': 1 };
      mesh.geometry.userData = { targetNames: ['Blink', 'Joy'] };
      const root = new Group();
      root.add(mesh);
      expect(new ModelActor(root, [], 'knight').shapes).toEqual(['Blink', 'Joy']);
    });

    it('holds the expression its piece gives it, and lets go of a shape once it is given no more', () => {
      const { actor, influences } = faced(['Joy', 'Angry']);
      actor.cast({ ...ASKED, face: { ...MODEL_FACE_AS_MADE, weights: { Joy: 0.7 } } });
      expect(actor.advance(at(0))).toBe('still');
      expect(influences).toEqual([0.7, 0]);

      actor.cast({ ...ASKED, face: { ...MODEL_FACE_AS_MADE, weights: { Angry: 1 } } });
      actor.advance(at(10));
      expect(influences).toEqual([0, 1]);
    });

    it('blinks as it stands, wanting a frame now and then, and not where standing motions are not played', () => {
      const { actor, influences } = faced(['Blink']);
      actor.cast(ASKED);
      const shut: number[] = [];
      for (let ms = 0; ms < 12_000; ms += 20) {
        expect(actor.advance(at(ms))).toBe('slow');
        shut.push(influences[0]);
      }
      expect(Math.max(...shut)).toBeGreaterThan(0.8);
      expect(shut.filter((weight) => weight === 0).length).toBeGreaterThan(shut.length / 2);

      for (let ms = 12_000; ms < 24_000; ms += 20) {
        expect(actor.advance(at(ms, { standing: false }))).toBe('still');
        expect(influences[0]).toBe(0);
      }
    });

    it('moves its mouth while its piece speaks, wanting a frame now and then, where it has a shape to speak with', () => {
      const { actor, influences } = faced(['aa', 'Joy']);
      actor.cast({ ...ASKED, face: { ...MODEL_FACE_AS_MADE, blink: NO_SHAPE } });
      expect(actor.advance(at(0))).toBe('still');

      actor.speak(true);
      const open: number[] = [];
      for (let ms = 0; ms < 2000; ms += 20) {
        expect(actor.advance(at(ms))).toBe('slow');
        open.push(influences[0]);
      }
      expect(Math.max(...open)).toBeGreaterThan(0.4);

      actor.speak(false);
      expect(actor.advance(at(2020))).toBe('still');
      expect(influences[0]).toBe(0);

      const mute = faced(['Joy']);
      mute.actor.cast({ ...ASKED, face: { ...MODEL_FACE_AS_MADE, blink: NO_SHAPE } });
      mute.actor.speak(true);
      expect(mute.actor.advance(at(0))).toBe('still');
    });

    it('stands still where its piece has turned its blinking off and gives it nothing to sway between', () => {
      const { actor } = faced(['Blink']);
      actor.cast({ ...ASKED, face: { ...MODEL_FACE_AS_MADE, blink: NO_SHAPE } });

      expect(actor.advance(at(0))).toBe('still');
    });
  });
});

describe('posedPlacement', () => {
  const placed = new Matrix4().makeTranslation(100, 0, 200);
  const foot = new Vector3(100, 0, 200);
  const east = new Vector3(1, 0, 0);
  const drawn = (matrix: Matrix4, x: number, y: number, z: number) => {
    const point = new Vector3(x, y, z).applyMatrix4(matrix);
    return [point.x, point.y, point.z].map((value) => Math.round(value * 1000) / 1000 + 0);
  };

  it('leaves a model that stands as it was made where it was placed', () => {
    expect(posedPlacement(placed, foot, east, MADE_REST, 50, new Matrix4())).toEqual(placed);
  });

  it('carries it towards the other and lifts it, by so many widths of its piece', () => {
    const pose = { lift: 0.2, forward: 0.5, pitchDeg: 0, stretch: 1 };

    expect(drawn(posedPlacement(placed, foot, east, pose, 50, new Matrix4()), 0, 0, 0)).toEqual([125, 10, 200]);
  });

  it('tips it towards the other about its foot, and back from the other below nought', () => {
    const forward = posedPlacement(placed, foot, east, { ...MADE_REST, pitchDeg: 90 }, 50, new Matrix4());
    const back = posedPlacement(placed, foot, east, { ...MADE_REST, pitchDeg: -90 }, 50, new Matrix4());

    expect(drawn(forward, 0, 10, 0)).toEqual([110, 0, 200]);
    expect(drawn(back, 0, 10, 0)).toEqual([90, 0, 200]);
    expect(drawn(forward, 0, 0, 0)).toEqual([100, 0, 200]);
  });

  it('stretches it upright from its foot', () => {
    const tall = posedPlacement(placed, foot, east, { ...MADE_REST, stretch: 1.5 }, 50, new Matrix4());

    expect(drawn(tall, 3, 10, 4)).toEqual([103, 15, 204]);
  });
});
