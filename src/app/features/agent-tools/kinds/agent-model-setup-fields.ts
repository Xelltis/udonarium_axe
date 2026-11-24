import { modelFaceOf, writeModelFace } from '@axe/domain/tabletop/model-face';
import { modelLookOf, writeModelLook } from '@axe/domain/tabletop/model-look';
import { modelMotionsOf, writeModelMotions } from '@axe/domain/tabletop/model-motions';
import { MAX_MODEL_SETUP_TEXT } from '@axe/domain/tabletop/piece-model';
import { type AgentKindField, textField } from '@axe/features/agent-tools/kinds/agent-kind';

/** What a piece or a block keeps of how its model is moved, drawn and blended. */
export interface ModelSetup {
  modelIdle: string;
  modelWalk: string;
  modelLook: string;
  modelMotions: string;
  modelFace: string;
}

/**
 * The fields of how a piece's or a block's model is moved, drawn and blended, as its sheet sets them
 * up: the motions it plays standing and walking, and its look, its motions in a fight and its face,
 * each written as the text of a record of what differs from the model as it was made and kept as the
 * sheet would write it. `changed` tells the room of a change, where writing the field does not.
 */
export function modelSetupFields<T extends ModelSetup>(
  changed: (object: T) => void = () => undefined
): AgentKindField<T>[] {
  const put =
    (write: (object: T, value: string) => void) =>
    (object: T, value: string): void => {
      write(object, value);
      changed(object);
    };
  return [
    textField<T>(
      'model_idle',
      "The motion its model plays standing still, by name; empty for the model's own.",
      'write',
      (object) => object.modelIdle,
      put((object, value) => (object.modelIdle = value.trim())),
      200
    ),
    textField<T>(
      'model_walk',
      "The motion its model plays walking, by name; empty for the model's own.",
      'write',
      (object) => object.modelWalk,
      put((object, value) => (object.modelWalk = value.trim())),
      200
    ),
    textField<T>(
      'model_look',
      'How its model\'s materials are drawn, as JSON of what differs from the model as made, or empty for as made: finish ("" as made, "matte" or "toon"), tint and glow as #rrggbb, plain (true to drop its picture), metalness, roughness and opacity from 0 to 1, glowStrength from 0 to 8, and materials, by material name or "#index", each with the same fields and hidden. Kept as the sheet writes it.',
      'write',
      (object) => object.modelLook,
      put((object, value) => (object.modelLook = writeModelLook(modelLookOf(value)))),
      MAX_MODEL_SETUP_TEXT
    ),
    textField<T>(
      'model_motions',
      "The motions its model plays in a fight, as JSON, or empty for the model's own: attack, cast, hit and defeat each a motion's name, and made (false to leave a role the model has no motion for unplayed rather than move the whole model). Kept as the sheet writes it.",
      'write',
      (object) => object.modelMotions,
      put((object, value) => (object.modelMotions = writeModelMotions(modelMotionsOf(value)))),
      MAX_MODEL_SETUP_TEXT
    ),
    textField<T>(
      'model_face',
      'What its model does with the shapes it can be blended towards, as JSON, or empty for its own: blink, mouth and breath each a shape\'s name ("-" for none), weights a shape\'s name to how far it is held from 0 to 1, and sways a list of { name, periodMs, amount }. Kept as the sheet writes it.',
      'write',
      (object) => object.modelFace,
      put((object, value) => (object.modelFace = writeModelFace(modelFaceOf(value)))),
      MAX_MODEL_SETUP_TEXT
    ),
  ];
}
