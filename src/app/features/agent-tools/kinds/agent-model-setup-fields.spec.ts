import { type ModelSetup, modelSetupFields } from '@axe/features/agent-tools/kinds/agent-model-setup-fields';

describe('the fields of how a model is set up, as the AI writes them', () => {
  function setUp() {
    const object: ModelSetup = { modelIdle: '', modelWalk: '', modelLook: '', modelMotions: '', modelFace: '' };
    const told: ModelSetup[] = [];
    const fields = new Map(modelSetupFields<ModelSetup>((one) => told.push(one)).map((field) => [field.name, field]));
    const write = (name: string, value: string) => fields.get(name)!.put!(object, value);
    return { object, told, fields, write };
  }

  it('offers the motions standing and walking, the look, the fight motions and the face', () => {
    expect([...setUp().fields.keys()]).toEqual([
      'model_idle',
      'model_walk',
      'model_look',
      'model_motions',
      'model_face',
    ]);
  });

  it('keeps each as the sheet writes it, dropping what is not of it, and tells the room', () => {
    const { object, told, write } = setUp();

    write('model_look', '{"metalness":4,"tint":"#ABCDEF","bogus":1}');
    write('model_motions', '{"attack":" Slash ","made":false}');
    write('model_face', '{"blink":"-","weights":{"Joy":0.5,"Sad":-1}}');
    write('model_idle', '  Guard ');

    expect(object).toEqual({
      modelIdle: 'Guard',
      modelWalk: '',
      modelLook: '{"tint":"#abcdef","metalness":1}',
      modelMotions: '{"attack":"Slash","made":false}',
      modelFace: '{"blink":"-","weights":{"Joy":0.5}}',
    });
    expect(told).toHaveLength(4);
  });

  it('keeps nothing of what cannot be read, as the model as made', () => {
    const { object, write } = setUp();
    object.modelLook = '{"finish":"toon"}';

    write('model_look', 'not json');

    expect(object.modelLook).toBe('');
  });
});
