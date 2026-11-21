import { meshesOf } from '@axe/infrastructure/three-kit/model-faces';
import type { SwingingParts, VrmExpression, VrmRig } from '@axe/infrastructure/three-kit/vrm-rig';
import {
  MToonMaterialLoaderPlugin,
  type VRM,
  VRMExpressionMorphTargetBind,
  VRMLoaderPlugin,
  VRMUtils,
} from '@pixiv/three-vrm';
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
}

/**
 * Readies a VRM read for what draws it: turned to face the way every other model does, which a VRM
 * from before version 1 faces away from, its meshes and their skeletons cut down to what they use,
 * and its swinging parts taken out of the model to be made again for each copy of it. Answers what it
 * is rigged with, or nothing for a model that is no VRM.
 */
export function readiedVrm(gltf: GLTF): VrmRig | null {
  const vrm = gltf.userData['vrm'] as VRM | undefined;
  if (!vrm) return null;
  if (vrm.meta?.metaVersion === '0') VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  const springs = vrm.springBoneManager ? swingingPlanOf(vrm.springBoneManager, gltf.scene) : null;
  const expressions = expressionsOf(vrm, gltf.scene);
  return {
    expressions,
    swingingOf: (copy) => (springs ? makeSwinging(springs, copy) : null),
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

/** What swings in a model, written by where each object stands in a walk of the model, to be made again on a copy. */
interface SwingingPlan {
  readonly colliders: readonly { readonly node: number; readonly collider: VRMSpringBoneCollider }[];
  readonly groups: readonly (readonly number[])[];
  readonly joints: readonly {
    readonly bone: number;
    readonly child: number | null;
    readonly center: number | null;
    readonly settings: VRMSpringBoneJoint['settings'];
    readonly groups: readonly number[];
  }[];
}

/**
 * Writes down what swings in a model by where each bone stands in a walk of it, and takes the
 * colliders the swinging parts are kept off the body by out of the model: they cannot be copied with
 * it, and are made again on each copy's own bones.
 */
function swingingPlanOf(manager: VRMSpringBoneManager, scene: Object3D): SwingingPlan | null {
  const colliders = manager.colliders;
  const hungFrom = new Map(colliders.map((collider) => [collider, collider.parent]));
  for (const collider of colliders) collider.removeFromParent();
  const order = new Map<Object3D, number>();
  let at = 0;
  scene.traverse((object) => order.set(object, at++));
  const nodeOf = (object: Object3D | null | undefined) => (object ? (order.get(object) ?? null) : null);
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
  const nodes: Object3D[] = [];
  copy.traverse((object) => nodes.push(object));
  const colliders = plan.colliders.map(({ node, collider }) => {
    const made = new Collider(collider.shape);
    made.position.copy(collider.position);
    made.quaternion.copy(collider.quaternion);
    nodes[node]?.add(made);
    return made;
  });
  const groups: VRMSpringBoneColliderGroup[] = plan.groups.map((indexes) => ({
    colliders: indexes.flatMap((index) => (colliders[index] ? [colliders[index]] : [])),
  }));
  const manager = new VRMSpringBoneManager();
  for (const joint of plan.joints) {
    const bone = nodes[joint.bone];
    if (!bone) continue;
    const made = new Joint(
      bone,
      joint.child === null ? null : (nodes[joint.child] ?? null),
      { ...joint.settings },
      joint.groups.flatMap((index) => (groups[index] ? [groups[index]] : []))
    );
    if (joint.center !== null) made.center = nodes[joint.center] ?? null;
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
