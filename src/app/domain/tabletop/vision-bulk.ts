import { LightConfig } from '@axe/domain/tabletop/vision-types';

/** A piece whose sight can be set, and which knows how to tell the room it changed. */
export type VisionBulkMember = LightConfig & { update(): void; readonly identifier?: string };

/** Several pieces answered for as one, with the identifiers of those that have one, to follow them by. */
export type VisionBulkTarget = LightConfig & { update(): void; readonly identifiers: readonly string[] };

/**
 * The fields settled by `applyVisionShape`, which writes several of them for one choice.
 *
 * Named here so the fan-out covers them: a shape chosen once has to reach every piece, not
 * just the field the reader happened to touch.
 */
const VISION_FIELDS = [
  'visionType',
  'visionRange',
  'visionShape',
  'visionConeAngle',
  'visionConeCount',
  'visionBackAngle',
  'visionBackScale',
  'visionPeripheralScale',
  'visionDirection',
  'visionLobes',
  'showVisionRange',
  'castsShadow',
] as const satisfies readonly (keyof LightConfig)[];

/**
 * Several pieces answered for as one, so that a reader sets their sight once.
 *
 * Read from the first of them and written to all: a field left alone is left alone on every
 * piece, and a field touched once reaches every piece. Pieces that disagreed about a field
 * before it was touched are not made to agree by the reading; they are made to agree by the
 * writing, which is what the reader asked for.
 */
export function bulkVisionTarget(members: readonly VisionBulkMember[]): VisionBulkTarget {
  const first = members[0];
  const target = {
    update(): void {
      for (const member of members) member.update();
    },
  } as VisionBulkTarget;
  Object.defineProperty(target, 'identifiers', {
    value: members.flatMap((member) => (typeof member.identifier === 'string' ? [member.identifier] : [])),
  });

  for (const field of VISION_FIELDS) {
    Object.defineProperty(target, field, {
      enumerable: true,
      get: () => first?.[field],
      set: (value: unknown) => {
        for (const member of members) Object.assign(member, { [field]: value });
      },
    });
  }
  return target;
}

/**
 * Whether the pieces already agree about a field, which is what lets a reader be told they
 * do not before they change one.
 */
export function visionFieldsAgree(members: readonly VisionBulkMember[], field: keyof LightConfig): boolean {
  if (members.length < 2) return true;
  const first = members[0][field];
  return members.every((member) => member[field] === first);
}

/** The fields the pieces disagree about, in the order they are shown. */
export function disagreeingVisionFields(members: readonly VisionBulkMember[]): (keyof LightConfig)[] {
  return VISION_FIELDS.filter((field) => !visionFieldsAgree(members, field));
}
