import { readiedVrm } from '@axe/infrastructure/three-kit/vrm-reading';
import {
  VRMAimConstraint,
  VRMExpression,
  VRMExpressionMorphTargetBind,
  VRMNodeConstraintManager,
} from '@pixiv/three-vrm';
import {
  VRMSpringBoneCollider,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneJoint,
  VRMSpringBoneManager,
} from '@pixiv/three-vrm-springbone';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * A VRM as the reader of VRMs leaves it: a head with a face that blinks, and a tail of two bones
 * hanging from the hips, which swings and is kept off the hips by a collider hung from them.
 */
function readVrm(metaVersion: '0' | '1' = '1') {
  const scene = new Group();
  const hips = new Object3D();
  hips.name = 'hips';
  const tail = new Object3D();
  tail.name = 'tail';
  tail.position.set(0, -1, 0);
  const tip = new Object3D();
  tip.name = 'tip';
  tip.position.set(0, -1, 0);
  scene.add(hips);
  hips.add(tail);
  tail.add(tip);
  const face = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  face.morphTargetInfluences = [0, 0];
  scene.add(face);

  const collider = new VRMSpringBoneCollider(new VRMSpringBoneColliderShapeSphere({ radius: 0.2 }));
  hips.add(collider);
  const manager = new VRMSpringBoneManager();
  const group = { colliders: [collider] };
  manager.addJoint(new VRMSpringBoneJoint(tail, tip, { gravityPower: 1, stiffness: 0.1 }, [group]));

  const blink = new VRMExpression('blink');
  blink.addBind(new VRMExpressionMorphTargetBind({ primitives: [face], index: 1, weight: 0.8 }));
  const gltf = {
    scene,
    animations: [],
    userData: {
      vrm: { scene, meta: { metaVersion }, springBoneManager: manager, expressionManager: { expressions: [blink] } },
    },
  } as unknown as GLTF;
  return { gltf, scene, collider };
}

describe('readiedVrm', () => {
  it('is nothing for a model that is no VRM', () => {
    expect(readiedVrm({ scene: new Group(), animations: [], userData: {} } as unknown as GLTF)).toBeNull();
  });

  it('names the shapes the VRM blends its face towards, each with the morphs it moves by the mesh’s order', () => {
    const { gltf } = readVrm();

    expect(readiedVrm(gltf)?.expressions).toEqual([{ name: 'blink', binds: [{ mesh: 0, morph: 1, weight: 0.8 }] }]);
  });

  it('takes the colliders out of the model, so that a copy of it can be made', () => {
    const { gltf, scene, collider } = readVrm();
    readiedVrm(gltf);

    expect(collider.parent).toBeNull();
    expect(() => cloneSkinned(scene)).not.toThrow();
  });

  it('makes what swings again on each copy’s own bones, which swing as the copy moves', () => {
    const { gltf, scene } = readVrm();
    const rig = readiedVrm(gltf)!;
    const copy = cloneSkinned(scene);
    const other = cloneSkinned(scene);
    const swinging = rig.swingingOf(copy)!;
    rig.swingingOf(other);
    const tipOf = (root: Object3D) => root.getObjectByName('tip')!.getWorldPosition(new Vector3());
    const restingTip = tipOf(copy);

    copy.position.x = 3;
    for (let step = 0; step < 20; step++) swinging.update(1 / 60);

    expect(Math.abs(tipOf(copy).x - 3 - restingTip.x)).toBeGreaterThan(0.01);
    expect(tipOf(other)).toEqual(restingTip);
    expect(copy.getObjectByName('hips')!.children.some((child) => child instanceof VRMSpringBoneCollider)).toBe(true);
    expect(scene.getObjectByName('hips')!.children.some((child) => child instanceof VRMSpringBoneCollider)).toBe(false);
  });

  it('turns a VRM from before version 1, which faces away, to face as every other model does', () => {
    const before = readVrm('0');
    const after = readVrm('1');
    readiedVrm(before.gltf);
    readiedVrm(after.gltf);

    expect(before.scene.rotation.y).toBeCloseTo(Math.PI);
    expect(after.scene.rotation.y).toBe(0);
  });

  it('makes nothing swing on a VRM with nothing that swings', () => {
    const { gltf } = readVrm();
    (gltf.userData['vrm'] as { springBoneManager?: unknown }).springBoneManager = undefined;

    expect(readiedVrm(gltf)?.swingingOf(new Group())).toBeNull();
  });

  it('ties a bone to another on each copy’s own bones, found by name though what swings hangs on the copy, which follows as the copy’s bone moves', () => {
    const { gltf, scene } = readVrm();
    const arm = new Object3D();
    arm.name = 'arm';
    arm.position.set(1, 1, 0);
    const elbow = new Object3D();
    elbow.name = 'elbow';
    elbow.position.set(1, 0, 0);
    const sleeve = new Object3D();
    sleeve.name = 'sleeve';
    scene.add(arm);
    arm.add(elbow);
    arm.parent!.add(sleeve);
    sleeve.position.copy(arm.position);
    const aim = new VRMAimConstraint(sleeve, elbow);
    aim.aimAxis = 'PositiveX';
    const manager = new VRMNodeConstraintManager();
    manager.addConstraint(aim);
    (gltf.userData['vrm'] as { nodeConstraintManager?: unknown }).nodeConstraintManager = manager;
    const rig = readiedVrm(gltf)!;
    const copy = cloneSkinned(scene);
    rig.swingingOf(copy);
    const ties = rig.tiesOf(copy)!;
    const along = (object: Object3D) =>
      new Vector3(1, 0, 0).applyQuaternion(object.getWorldQuaternion(new Quaternion()));

    copy.getObjectByName('arm')!.rotation.set(0, 0, -Math.PI / 2);
    ties.update();

    const pointing = along(copy.getObjectByName('sleeve')!);
    expect([pointing.x, pointing.y].map((value) => Number(value.toFixed(3)))).toEqual([0, -1]);
    expect(along(scene.getObjectByName('sleeve')!).x).toBeCloseTo(1);
  });

  it('ties nothing on a VRM that ties no bones', () => {
    const { gltf } = readVrm();

    expect(readiedVrm(gltf)?.tiesOf(new Group())).toBeNull();
  });
});
