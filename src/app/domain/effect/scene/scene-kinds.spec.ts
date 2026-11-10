import { sceneLooks } from '@axe/domain/effect/scene/effect-frame';
import {
  ALONGSIDE_PICTURES,
  SCENE_LINGER_S,
  STRIKING_WITH,
  TRAVELLING_LINGER_S,
} from '@axe/domain/effect/scene/scene-kinds';

describe('the list of looks drawn in the scene', () => {
  it('names every look the scene draws, and nothing else, with how long each lingers', () => {
    const { wholly } = sceneLooks();

    expect(Object.keys(SCENE_LINGER_S).sort()).toEqual(Object.keys(wholly).sort());
    for (const [kind, look] of Object.entries(wholly)) {
      expect([kind, SCENE_LINGER_S[kind as keyof typeof SCENE_LINGER_S]]).toEqual([kind, look!.lingerS]);
    }
  });

  it('names the looks drawn alongside a piece’s picture and those that travel as a stage, as the scene has them', () => {
    const { alongside, travelling } = sceneLooks();

    expect([...ALONGSIDE_PICTURES].sort()).toEqual(Object.keys(alongside).sort());
    expect([...STRIKING_WITH].sort()).toEqual(Object.keys(travelling).sort());
    for (const [kind, look] of Object.entries(travelling)) {
      expect(TRAVELLING_LINGER_S[kind as keyof typeof TRAVELLING_LINGER_S]).toBe(look!.lingerS);
    }
  });
});
