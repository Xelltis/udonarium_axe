import { meshesOf } from '@axe/infrastructure/three-kit/model-faces';
import { VrmMotionMaker } from '@axe/infrastructure/three-kit/vrm-motion';
import type { SwingingParts, TiedParts, VrmExpression, VrmRig } from '@axe/infrastructure/three-kit/vrm-rig';
import {
  MToonMaterialLoaderPlugin,
  type VRM,
  VRMAimConstraint,
  VRMExpressionMorphTargetBind,
  VRMLoaderPlugin,
  type VRMNodeConstraint,
  VRMNodeConstraintManager,
  VRMRollConstraint,
  VRMRotationConstraint,
  VRMUtils,
} from '@pixiv/three-vrm';
import { type VRMAnimation, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import {
  VRMSpringBoneCollider as Collider,
  type VRMSpringBoneCollider,
  type VRMSpringBoneColliderGroup,
  VRMSpringBoneJoint as Joint,
  type VRMSpringBoneJoint,
  VRMSpringBoneManager,
} from '@pixiv/three-vrm-springbone';
import type { Object3D } from 'three';
import type { GLTF, GLTFLoader, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Has a loader read the VRM in what it parses: its expressions, its swinging parts and its MToon
 * materials, as the materials a WebGL renderer draws them with, which whatever draws through WebGPU
 * makes over as its own. The bones it is posed by are left as they were made, never moved for it.
 */
export function readVrmWith(loader: GLTFLoader): void {
  loader.register(
    (parser: GLTFParser) =>
      new VRMLoaderPlugin(parser, {
        autoUpdateHumanBones: false,
        mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser),
      })
  );
  loader.register((parser: GLTFParser) => new VRMAnimationLoaderPlugin(parser));
}

/** The motion for VRM models a `.vrma` read by a loader {@link readVrmWith} readied holds, or null for one holding none. */
export function vrmMotionIn(gltf: GLTF): VRMAnimation | null {
  const motions = gltf.userData['vrmAnimations'] as VRMAnimation[] | undefined;
  return motions?.[0] ?? null;
}

/**
 * Readies a VRM read for what draws it: turned to face the way every other model does, which a VRM
 * from before version 1 faces away from, its meshes and their skeletons cut down to what they use,
 * and its swinging parts and the bones it ties to others written down, to be made again for each copy
 * of it; the bones are
 * measured as they stand at rest, for motions for VRM models to be made over into motions of them.
 * Answers what it is rigged with, or nothing for a model that is no VRM.
 */
export function readiedVrm(gltf: GLTF): VrmRig | null {
  const vrm = gltf.userData['vrm'] as VRM | undefined;
  if (!vrm) return null;
  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  const springs = vrm.springBoneManager ? swingingPlanOf(vrm.springBoneManager, gltf.scene) : null;
  const expressions = expressionsOf(vrm, gltf.scene);
  const motions = new VrmMotionMaker(vrm, gltf.scene);
  const ties = vrm.nodeConstraintManager ? tiesPlanOf(vrm.nodeConstraintManager, gltf.scene) : null;
  return {
    expressions,
    swingingOf: (copy) => (springs ? makeSwinging(springs, copy) : null),
    tiesOf: (copy) => (ties ? makeTies(ties, copy) : null),
    motionOf: (motion, name) => motions.motionOf(motion as VRMAnimation, name),
  };
}

/** The shapes a VRM names, each with the morphs of the model's meshes it moves. */
function expressionsOf(vrm: VRM, scene: Object3D): VrmExpression[] {
  const meshes = meshesOf(scene);
  const placeOf = new Map<unknown, number>(meshes.map((mesh, index) => [mesh, index]));
  return (vrm.expressionManager?.expressions ?? []).flatMap((expression) => {
    const binds = expression.binds.flatMap((bind) => {
      if (!(bind instanceof VRMExpressionMorphTargetBind)) return [];
      return bind.primitives.flatMap((primitive) => {
        const mesh = placeOf.get(primitive);
        return mesh === undefined ? [] : [{ mesh, morph: bind.index, weight: bind.weight }];
      });
    });
    return binds.length > 0 ? [{ name: expression.expressionName, binds }] : [];
  });
}

/**
 * How a node of a model is found again on a copy of it: by its name, where no other node of the model
 * goes by it, as the bones of a VRM are named, or else by where it stands in a walk of the model's own
 * nodes, which passes over the colliders hung on a copy for what swings, as on the model before they
 * were taken out of it.
 */
type NodeKey = string;

/** The key each node of a model is found again on a copy by, as the model stands now. */
function nodeKeysOf(scene: Object3D): (object: Object3D | null | undefined) => NodeKey | null {
  const nodes = ownNodesOf(scene);
  const named = new Map<string, number>();
  for (const object of nodes) if (object.name) named.set(object.name, (named.get(object.name) ?? 0) + 1);
  const order = new Map(nodes.map((object, at) => [object, at]));
  return (object) => {
    if (!object) return null;
    if (object.name && named.get(object.name) === 1) return `name:${object.name}`;
    const index = order.get(object);
    return index === undefined ? null : `at:${index}`;
  };
}

/** The nodes of a model in the order of a walk of it, but for the colliders hung on it for what swings. */
function ownNodesOf(root: Object3D): Object3D[] {
  const nodes: Object3D[] = [];
  const walk = (object: Object3D) => {
    if (object instanceof Collider) return;
    nodes.push(object);
    for (const child of object.children) walk(child);
  };
  walk(root);
  return nodes;
}

/** The node of a copy of a model a key finds. */
function nodeFinderOf(copy: Object3D): (key: NodeKey | null) => Object3D | null {
  const nodes = ownNodesOf(copy);
  const byName = new Map<string, Object3D>();
  for (const object of nodes) if (object.name && !byName.has(object.name)) byName.set(object.name, object);
  return (key) => {
    if (key === null) return null;
    if (key.startsWith('name:')) return byName.get(key.slice(5)) ?? null;
    return nodes[Number(key.slice(3))] ?? null;
  };
}

/** What swings in a model, written by how each node of it is found again on a copy (see {@link NodeKey}), to be made again on one. */
interface SwingingPlan {
  readonly colliders: readonly { readonly node: NodeKey; readonly collider: VRMSpringBoneCollider }[];
  readonly groups: readonly (readonly number[])[];
  readonly joints: readonly {
    readonly bone: NodeKey;
    readonly child: NodeKey | null;
    readonly center: NodeKey | null;
    readonly settings: VRMSpringBoneJoint['settings'];
    readonly groups: readonly number[];
  }[];
}

/**
 * Writes down what swings in a model by how each bone of it is found again on a copy, and takes the
 * colliders the swinging parts are kept off the body by out of the model: they cannot be copied with
 * it, and are made again on each copy's own bones.
 */
function swingingPlanOf(manager: VRMSpringBoneManager, scene: Object3D): SwingingPlan | null {
  const colliders = manager.colliders;
  const hungFrom = new Map(colliders.map((collider) => [collider, collider.parent]));
  for (const collider of colliders) collider.removeFromParent();
  const nodeOf = nodeKeysOf(scene);
  const colliderAt = new Map(colliders.map((collider, index) => [collider, index]));
  const groupAt = new Map(manager.colliderGroups.map((group, index) => [group, index]));
  const placedColliders: SwingingPlan['colliders'][number][] = [];
  colliders.forEach((collider) => {
    const node = nodeOf(hungFrom.get(collider));
    if (node !== null) placedColliders.push({ node, collider });
  });
  const joints = [...manager.joints].flatMap((joint) => {
    const bone = nodeOf(joint.bone);
    if (bone === null) return [];
    return [
      {
        bone,
        child: nodeOf(joint.child),
        center: nodeOf(joint.center),
        settings: { ...joint.settings },
        groups: joint.colliderGroups.flatMap((group) => {
          const index = groupAt.get(group);
          return index === undefined ? [] : [index];
        }),
      },
    ];
  });
  if (joints.length === 0) return null;
  return {
    colliders: placedColliders,
    groups: manager.colliderGroups.map((group) =>
      group.colliders.flatMap((collider) => {
        const index = colliderAt.get(collider);
        return index === undefined ? [] : [index];
      })
    ),
    joints,
  };
}

/** Makes what swings on a copy of a model, on the copy's own bones, as the model's plan has it. */
function makeSwinging(plan: SwingingPlan, copy: Object3D): SwingingParts {
  const find = nodeFinderOf(copy);
  const colliders = plan.colliders.map(({ node, collider }) => {
    const made = new Collider(collider.shape);
    made.position.copy(collider.position);
    made.quaternion.copy(collider.quaternion);
    find(node)?.add(made);
    return made;
  });
  const groups: VRMSpringBoneColliderGroup[] = plan.groups.map((indexes) => ({
    colliders: indexes.flatMap((index) => (colliders[index] ? [colliders[index]] : [])),
  }));
  const manager = new VRMSpringBoneManager();
  for (const joint of plan.joints) {
    const bone = find(joint.bone);
    if (!bone) continue;
    const made = new Joint(
      bone,
      find(joint.child),
      { ...joint.settings },
      joint.groups.flatMap((index) => (groups[index] ? [groups[index]] : []))
    );
    if (joint.center !== null) made.center = find(joint.center);
    manager.addJoint(made);
  }
  copy.updateWorldMatrix(true, true);
  manager.setInitState();
  return {
    update: (seconds) => {
      copy.updateWorldMatrix(true, true);
      manager.update(seconds);
    },
    reset: () => manager.reset(),
  };
}

/** How one bone is tied to another: the kinds a VRM ties by, and the bones by how each is found again on a copy. */
interface TiePlan {
  readonly kind: 'aim' | 'roll' | 'rotation';
  readonly destination: NodeKey;
  readonly source: NodeKey;
  readonly weight: number;
  readonly axis: string;
}

/** Writes down how the bones of a model are tied to others, by how each bone is found again on a copy. */
function tiesPlanOf(manager: VRMNodeConstraintManager, scene: Object3D): TiePlan[] | null {
  const nodeOf = nodeKeysOf(scene);
  const plans: TiePlan[] = [];
  for (const tie of manager.constraints) {
    const destination = nodeOf(tie.destination);
    const source = nodeOf(tie.source);
    if (destination === null || source === null) continue;
    if (tie instanceof VRMAimConstraint)
      plans.push({ kind: 'aim', destination, source, weight: tie.weight, axis: tie.aimAxis });
    else if (tie instanceof VRMRollConstraint)
      plans.push({ kind: 'roll', destination, source, weight: tie.weight, axis: tie.rollAxis });
    else if (tie instanceof VRMRotationConstraint)
      plans.push({ kind: 'rotation', destination, source, weight: tie.weight, axis: '' });
  }
  return plans.length > 0 ? plans : null;
}

/** Ties the bones of a copy of a model as the model's plan has it, from the copy standing at rest. */
function makeTies(plans: readonly TiePlan[], copy: Object3D): TiedParts {
  const find = nodeFinderOf(copy);
  const manager = new VRMNodeConstraintManager();
  for (const plan of plans) {
    const destination = find(plan.destination);
    const source = find(plan.source);
    if (!destination || !source) continue;
    let tie: VRMNodeConstraint;
    if (plan.kind === 'aim') {
      const aim = new VRMAimConstraint(destination, source);
      aim.aimAxis = plan.axis as VRMAimConstraint['aimAxis'];
      tie = aim;
    } else if (plan.kind === 'roll') {
      const roll = new VRMRollConstraint(destination, source);
      roll.rollAxis = plan.axis as VRMRollConstraint['rollAxis'];
      tie = roll;
    } else {
      tie = new VRMRotationConstraint(destination, source);
    }
    tie.weight = plan.weight;
    manager.addConstraint(tie);
  }
  copy.updateWorldMatrix(true, true);
  manager.setInitState();
  return {
    update: () => {
      copy.updateWorldMatrix(true, true);
      manager.update();
    },
  };
}
