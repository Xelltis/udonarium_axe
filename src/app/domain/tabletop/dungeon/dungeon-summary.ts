import { DungeonLayout, DungeonRoomRoleValue } from '@axe/domain/tabletop/dungeon/dungeon-layout';

export interface DungeonSummaryLabels {
  roleName(role: DungeonRoomRoleValue): string;
  title: string;
  start: string;
  key: string;
  locked: string;
  torch: string;
  doors: string;
}

export interface DungeonSummaryInput {
  layout: DungeonLayout;
  name: string;
  torchRooms: readonly number[];
  labels: DungeonSummaryLabels;
}

/**
 * The sheet the master reads while running the place.
 *
 * A generated dungeon nobody can describe is a floor plan, not an adventure, so every
 * room gets a number, a part to play, what it joins, and whatever was put in it.
 */
export function buildDungeonSummary(input: DungeonSummaryInput): string {
  const { layout, labels } = input;
  const torches = new Set(input.torchRooms);

  const lines = [
    `${input.name} / ${labels.title} ${layout.seed} / ${layout.width}x${layout.height}`,
    `${labels.start}: #1 (${layout.entrance.x}, ${layout.entrance.y})`,
    '',
  ];

  for (const room of layout.rooms) {
    // The leaves that stand in the doorways, not the cells they fill: a door widened to four
    // cells is one door, and was counted as four.
    const ways = layout.doorLeaves.filter((leaf) => leaf.rooms.includes(room.index));
    const shut = ways.length > 0 && ways.every((door) => door.locked);

    const notes: string[] = [];
    if (layout.keyRoomIndex === room.index) notes.push(labels.key);
    if (shut) notes.push(labels.locked);
    if (torches.has(room.index)) notes.push(labels.torch);

    const cells = [
      `#${room.index + 1}`,
      labels.roleName(room.role),
      `${room.w}x${room.h}`,
      `${labels.doors} ${ways.length}`,
      notes.join(' '),
    ];
    lines.push(cells.filter((cell) => cell.length > 0).join('  '));
  }

  return lines.join('\n');
}
