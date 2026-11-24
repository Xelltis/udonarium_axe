import { VrmMotionMaker } from '@axe/infrastructure/three-kit/vrm-motion';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';
import {
  AnimationMixer,
  Euler,
  Group,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';

/**
 * A VRM whose bones are laid out each along axes of its own: the hips under a node of the model turned
 * and moved, and an upper arm under a chest turned another way, itself turned at rest.
 */
function vrmLaidOut() {
  const root = new Group();
  const under = new Object3D();
  under.name = 'Armature';
  under.position.set(0, 0.1, 0);
  under.quaternion.setFromEuler(new Euler(-Math.PI / 2, 0, 0));
  const hips = new Object3D();
  hips.name = 'J_Hips';
  hips.position.set(0, 0, 1);
  const chest = new Object3D();
  chest.name = 'J_Chest';
  chest.quaternion.setFromEuler(new Euler(0.4, 0.2, -0.3));
  const arm = new Object3D();
  arm.name = 'J_LeftUpperArm';
  arm.quaternion.setFromEuler(new Euler(0, 0, Math.PI / 6));
  root.add(under);
  under.add(hips);
  hips.add(chest);
  chest.add(arm);
  const humanoid = {
    rawHumanBones: { hips: { node: hips }, leftUpperArm: { node: arm } },
    getNormalizedBoneNode: (name: string) => ({ name: `Normalized_${name}` }),
    normalizedRestPose: { hips: { position: [0, 1, 0] } },
  };
  const vrm = { humanoid, meta: { metaVersion: '1' } } as unknown as VRM;
  return { root, hips, arm, vrm };
}

/** A motion turning the left upper arm from as it stands to a turn given, and putting the hips at a place given. */
function motion(turn: Quaternion, hipsAt: Vector3): VRMAnimation {
  const rest = new Quaternion();
  return {
    duration: 1,
    restHipsPosition: new Vector3(0, 1, 0),
    humanoidTracks: {
      rotation: new Map([
        ['leftUpperArm', new QuaternionKeyframeTrack('a.quaternion', [0, 1], [...rest.toArray(), ...turn.toArray()])],
      ]),
      translation: new Map([['hips', new VectorKeyframeTrack('h.position', [0], hipsAt.toArray())]]),
    },
    expressionTracks: { preset: new Map(), custom: new Map() },
    lookAtTrack: null,
  } as unknown as VRMAnimation;
}

/** How a node is turned, and where it stands, from the model's root. */
function fromRoot(root: Object3D, node: Object3D) {
  root.updateMatrixWorld(true);
  const turn = root.getWorldQuaternion(new Quaternion()).invert().multiply(node.getWorldQuaternion(new Quaternion()));
  const place = root.worldToLocal(node.getWorldPosition(new Vector3()));
  return { turn, place };
}

describe('VrmMotionMaker', () => {
  it('turns a bone, from the model’s root, as the motion turns its normalized twin, from how it stands at rest', () => {
    const { root, arm, vrm } = vrmLaidOut();
    const atRest = fromRoot(root, arm).turn;
    const turn = new Quaternion().setFromEuler(new Euler(0, 0, -1.2));
    const clip = new VrmMotionMaker(vrm, root).motionOf(motion(turn, new Vector3(0, 1, 0)), 'Wave')!;
    const mixer = new AnimationMixer(root);
    mixer.clipAction(clip).play();

    mixer.setTime(0);
    expect(fromRoot(root, arm).turn.angleTo(atRest)).toBeCloseTo(0, 5);

    mixer.setTime(1 - 1e-6);
    expect(fromRoot(root, arm).turn.angleTo(turn.clone().multiply(atRest))).toBeCloseTo(0, 3);
    expect(clip.name).toBe('Wave');
  });

  it('stands the hips where the motion puts them, from the model’s root', () => {
    const { root, hips, vrm } = vrmLaidOut();
    const clip = new VrmMotionMaker(vrm, root).motionOf(motion(new Quaternion(), new Vector3(0.2, 1.3, -0.4)), 'Walk')!;
    const mixer = new AnimationMixer(root);
    mixer.clipAction(clip).play();

    mixer.setTime(0);

    const { place } = fromRoot(root, hips);
    expect([place.x, place.y, place.z].map((value) => Number(value.toFixed(5)))).toEqual([0.2, 1.3, -0.4]);
  });

  it('makes nothing of a motion that moves none of the model’s bones, nor for a model with no humanoid', () => {
    const { root, vrm } = vrmLaidOut();
    const elsewhere = motion(new Quaternion(), new Vector3());
    elsewhere.humanoidTracks.rotation.clear();
    elsewhere.humanoidTracks.translation.clear();

    expect(new VrmMotionMaker(vrm, root).motionOf(elsewhere, 'None')).toBeNull();
    expect(
      new VrmMotionMaker({ meta: {} } as unknown as VRM, root).motionOf(motion(new Quaternion(), new Vector3()), 'X')
    ).toBeNull();
  });
});
