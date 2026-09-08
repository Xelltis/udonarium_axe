import { seededRandom } from '@axe/core/util/seeded-random';
import { DungeonLayout, DungeonRoomRoleValue } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { buildDungeonSummary, DungeonSummaryLabels } from '@axe/domain/tabletop/dungeon/dungeon-summary';
import { assignRoomRoles } from '@axe/domain/tabletop/dungeon/room-roles';
import { generateRoomsAndMazes } from '@axe/domain/tabletop/dungeon/rooms-and-mazes';

const labels: DungeonSummaryLabels = {
  roleName: (role: DungeonRoomRoleValue) => role,
  title: 'seed',
  start: 'start',
  key: 'key',
  locked: 'locked',
  torch: 'torch',
  doors: 'doors',
};

function build(seed = 7): DungeonLayout {
  const layout = generateRoomsAndMazes(
    {
      width: 37,
      height: 27,
      roomCount: 8,
      minRoom: 5,
      maxRoom: 9,
      windingPercent: 25,
      extraConnectorChance: 0.06,
      wallBreakChance: 0,
      shapes: ['rect'],
      minCorridor: 1,
      maxCorridor: 1,
      seed,
    },
    seededRandom(seed)
  );
  assignRoomRoles(layout);
  return layout;
}

describe('buildDungeonSummary()', () => {
  it('opens with the name, the seed and the size', () => {
    const layout = build();
    const first = buildDungeonSummary({ layout, name: 'Stone Maze', torchRooms: [], labels }).split('\n')[0];

    expect(first).toBe(`Stone Maze / seed ${layout.seed} / ${layout.width}x${layout.height}`);
  });

  it('says where the party starts', () => {
    const layout = build();
    const text = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels });

    expect(text).toContain(`start: #1 (${layout.entrance.x}, ${layout.entrance.y})`);
  });

  it('lists one line per room, numbered from one', () => {
    const layout = build();
    const lines = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels }).split('\n').slice(3);

    expect(lines.length).toBe(layout.rooms.length);
    lines.forEach((line, index) => expect(line.startsWith(`#${index + 1}`)).toBe(true));
  });

  it('names the part each room plays and its size', () => {
    const layout = build();
    const lines = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels }).split('\n').slice(3);

    layout.rooms.forEach((room, index) => {
      expect(lines[index]).toContain(room.role);
      expect(lines[index]).toContain(`${room.w}x${room.h}`);
    });
  });

  it('marks the room holding the key', () => {
    const layout = build();
    const text = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels });
    if (layout.keyRoomIndex < 0) return;

    const line = text.split('\n').slice(3)[layout.keyRoomIndex];
    expect(line).toContain('key');
  });

  it('marks the rooms that were given a torch', () => {
    const layout = build();
    const text = buildDungeonSummary({ layout, name: 'x', torchRooms: [1, 3], labels });
    const lines = text.split('\n').slice(3);

    expect(lines[1]).toContain('torch');
    expect(lines[3]).toContain('torch');
    expect(lines[0]).not.toContain('torch');
  });

  it('marks the room that is shut', () => {
    const layout = build();
    if (!layout.doors.some((door) => door.locked)) return;

    const text = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels });

    expect(text).toContain('locked');
  });

  it('counts the ways into every room', () => {
    const layout = build();
    const lines = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels }).split('\n').slice(3);

    layout.rooms.forEach((room, index) => {
      const ways = layout.doors.filter((door) => door.rooms.includes(room.index)).length;
      expect(lines[index]).toContain(`doors ${ways}`);
    });
  });

  it('copes with a dungeon that has no rooms', () => {
    const layout = build();
    layout.rooms = [];
    layout.links = [];

    const text = buildDungeonSummary({ layout, name: 'x', torchRooms: [], labels });

    expect(text.split('\n').length).toBe(3);
  });
});
