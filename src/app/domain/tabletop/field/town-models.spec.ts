import { existsSync, readdirSync } from 'node:fs';

import { FIELD_ATMOSPHERES } from '@axe/domain/tabletop/field/field-atmosphere';
import { roofUnitModelOf, TOWN_KITS, TOWN_MODEL_IDS, townModelUrl } from '@axe/domain/tabletop/field/town-models';

describe('the bundled models of a town', () => {
  it('has every model it names bundled, and nothing bundled it does not name', () => {
    const folder = 'src/assets/models/town';
    expect(existsSync(folder)).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(TOWN_MODEL_IDS.map((id) => `${id}.glb`).sort());
    expect(townModelUrl('town_brick')).toBe('assets/models/town/town_brick.glb');
  });

  it('has a kit for every facade any town is built in', () => {
    const facades = Object.values(FIELD_ATMOSPHERES).flatMap((mood) => mood.town?.skins.map((skin) => skin.side) ?? []);
    expect(facades.length).toBeGreaterThan(0);
    for (const facade of facades) expect(TOWN_KITS[facade], facade).toBeDefined();
  });

  it('stands a wooden tank on the roofs of a town that keeps its water in tubs, and a plant room elsewhere', () => {
    expect(roofUnitModelOf({ plantSkin: { side: 'wood_plank', top: 'wood_plank' } })).toBe('roof_tank');
    expect(roofUnitModelOf({})).toBe('roof_plant');
  });
});
