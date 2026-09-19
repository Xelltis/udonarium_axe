import { planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { DungeonRoomRole } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { describeDungeon } from '@axe/features/tabletop/dungeon-generator/dungeon-notes';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const ja = createSyncTranslate('ja');

describe('describeDungeon()', () => {
  it('calls the rooms of a bar a floor and a VIP room, not a hall and a treasury', () => {
    const plan = planDungeon({ atmosphere: 'cyberBar', roomCount: 8, seed: 7 });
    const text = describeDungeon(plan.layout, plan.blocks, 'Bar', ja, plan.atmosphere.roleNames);

    expect(plan.layout.rooms.some((room) => room.role === DungeonRoomRole.Hall)).toBe(true);
    expect(text).toContain(ja('feature.tabletop.dungeonGenerator.roleIn.bar.hall'));
    expect(text).not.toContain(ja('feature.tabletop.dungeonGenerator.role.hall'));
  });

  it('calls the rooms of a dungeon what they have always been called', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });
    const text = describeDungeon(plan.layout, plan.blocks, 'Keep', ja, plan.atmosphere.roleNames);

    expect(text).toContain(ja('feature.tabletop.dungeonGenerator.role.hall'));
  });
});
