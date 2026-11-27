import type { VRM } from '@pixiv/three-vrm';
import { createVRMAnimationHumanoidTracks, type VRMAnimation } from '@pixiv/three-vrm-animation';
import {
  AnimationClip,
  type KeyframeTrack,
  Matrix4,
  type Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from 'three';

/** How a bone of a VRM stands at rest, measured from the model's root: what turning its normalized twin is made over into. */
interface BoneAtRest {
  readonly name: string;
  /** How the bone's parent is turned from the model's root. */
  readonly parentTurn: Quaternion;
  /** How the bone is turned from its parent. */
  readonly ownTurn: Quaternion;
  /** Where the bone's parent stands from the model's root, for the hips' place to be put in it. */
  readonly parentFromRoot: Matrix4;
}

/**
 * Makes motions for VRM models (`.vrma`) into motions of one VRM's own bones. A VRM Animation moves
 * the bones of a VRM as the VRM's normalized twin of them stands, which the reader of VRMs keeps in
 * step with the bones themselves only as it is updated, frame by frame, for one model: each turn and
 * the hips' place is made over here, once, into what the bones themselves are turned by and stand at,
 * as that update would make them, so the motion plays on any copy of the model, by the names of its
 * bones, as the model's own motions do.
 */
export class VrmMotionMaker {
  private readonly bones = new Map<string, BoneAtRest>();

  constructor(
    private readonly vrm: VRM,
    root: Object3D
  ) {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    root.updateMatrixWorld(true);
    const fromRoot = new Matrix4().copy(root.matrixWorld).invert();
    const rootTurn = root.getWorldQuaternion(new Quaternion()).invert();
    for (const [boneName, bone] of Object.entries(humanoid.rawHumanBones)) {
      const node = bone?.node;
      if (!node?.parent) continue;
      this.bones.set(boneName, {
        name: node.name,
        parentTurn: rootTurn.clone().multiply(node.parent.getWorldQuaternion(new Quaternion())),
        ownTurn: node.quaternion.clone(),
        parentFromRoot: new Matrix4().multiplyMatrices(fromRoot, node.parent.matrixWorld),
      });
    }
  }

  /** The motion made over into one of the model's own bones, under a name, or null where it moves none of them. */
  motionOf(animation: VRMAnimation, name: string): AnimationClip | null {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return null;
    const metaVersion = this.vrm.meta?.metaVersion === '0' ? '0' : '1';
    const { rotation, translation } = createVRMAnimationHumanoidTracks(animation, humanoid, metaVersion);
    const tracks: KeyframeTrack[] = [];
    for (const [boneName, track] of rotation) {
      const bone = this.bones.get(boneName);
      if (bone) tracks.push(turnedTrack(track, bone));
    }
    const hips = translation.get('hips');
    const hipsBone = this.bones.get('hips');
    if (hips && hipsBone) tracks.push(placedTrack(hips, hipsBone));
    return tracks.length > 0 ? new AnimationClip(name, animation.duration, tracks) : null;
  }
}

/**
 * A turn of a normalized bone made over into its own: the turn taken into the parent's frame and
 * put on top of how the bone is turned at rest, as the reader of VRMs makes it.
 */
function turnedTrack(track: QuaternionKeyframeTrack, bone: BoneAtRest): QuaternionKeyframeTrack {
  const values = new Float32Array(track.values.length);
  const intoParent = bone.parentTurn.clone().invert();
  const turn = new Quaternion();
  for (let at = 0; at < values.length; at += 4) {
    turn.fromArray(track.values, at);
    turn.multiply(bone.parentTurn).premultiply(intoParent).multiply(bone.ownTurn);
    turn.toArray(values, at);
  }
  return new QuaternionKeyframeTrack(`${bone.name}.quaternion`, Array.from(track.times), Array.from(values));
}

/** Where the hips stand, from the model's root, made over into where they stand in their parent. */
function placedTrack(track: VectorKeyframeTrack, hips: BoneAtRest): VectorKeyframeTrack {
  const values = new Float32Array(track.values.length);
  const intoParent = hips.parentFromRoot.clone().invert();
  const place = new Vector3();
  for (let at = 0; at < values.length; at += 3) {
    place.fromArray(track.values, at).applyMatrix4(intoParent);
    place.toArray(values, at);
  }
  return new VectorKeyframeTrack(`${hips.name}.position`, Array.from(track.times), Array.from(values));
}
