import { FieldAtmosphere, FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';
import { FieldLayout } from '@axe/domain/tabletop/field/field-layout';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';

export interface FieldSummaryLabels {
  seed: string;
  ground: string;
  standing: string;
  fires: string;
  textureName(texture: string): string;
  propName(prop: FieldPropId | 'building'): string;
}

export interface FieldSummaryInput {
  layout: FieldLayout;
  atmosphere: FieldAtmosphere;
  blocks: MapBlocks;
  name: string;
  seed: number;
  labels: FieldSummaryLabels;
}

/**
 * What the master needs to read a field at a glance.
 *
 * Open ground has no rooms to number, so what there is to say is what it is made of, how
 * thickly it is grown over, and where anything is already burning. A town's buildings are
 * counted one to a building, however many cells each stands on.
 */
export function buildFieldSummary(input: FieldSummaryInput): string {
  const { layout, atmosphere, labels } = input;
  const cells = layout.width * layout.height;

  const perBand = new Array(atmosphere.bands.length).fill(0);
  for (const band of layout.ground) perBand[band]++;
  const ground = atmosphere.bands
    .map((band, index) => ({ band, share: Math.round((perBand[index] / cells) * 100) }))
    .filter((entry) => entry.share > 0)
    .sort((left, right) => right.share - left.share)
    .map((entry) => `${labels.textureName(entry.band.texture)} ${entry.share}%`)
    .join(' / ');

  const perProp = new Map<FieldPropId, number>();
  for (const mark of layout.props) {
    if (!mark || mark === 'pool' || mark === 'building') continue;
    perProp.set(mark, (perProp.get(mark) ?? 0) + 1);
  }
  const counts = [...perProp.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([prop, count]) => `${labels.propName(prop)} ${count}`);
  if (layout.buildings.length > 0) counts.unshift(`${labels.propName('building')} ${layout.buildings.length}`);
  const standing = counts.join(' / ');

  const lines = [
    `${input.name} / ${labels.seed} ${input.seed} / ${layout.width}x${layout.height}`,
    `${labels.ground}: ${ground}`,
  ];
  if (standing) lines.push(`${labels.standing}: ${standing}`);
  if (input.blocks.lights.length > 0) {
    lines.push(`${labels.fires}: ${input.blocks.lights.map((light) => `(${light.x}, ${light.y})`).join(' ')}`);
  }

  return lines.join('\n');
}
