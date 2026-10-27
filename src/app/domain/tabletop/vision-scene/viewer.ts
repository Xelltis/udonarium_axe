import { SceneViewer, SceneVisionSource, VisionScene } from '@axe/domain/tabletop/vision-scene/scene-model';
import { VisionType } from '@axe/domain/tabletop/vision-types';

/**
 * Whether a viewer sees through the pieces of this owner: one of the viewer's vision owners when
 * those are given, otherwise the viewer's own user.
 *
 * An empty owner belongs to nobody.
 */
export function viewerOwns(viewer: SceneViewer, ownerId: string): boolean {
  if (!ownerId) return false;
  return viewer.visionOwnerIds ? viewer.visionOwnerIds.includes(ownerId) : ownerId === viewer.userId;
}

/**
 * Whether a viewer sees through a piece: it is theirs, or it belongs to a party the viewer is in.
 */
export function viewerShares(viewer: SceneViewer, ownerId: string, partyId: string | undefined): boolean {
  if (viewerOwns(viewer, ownerId)) return true;
  if (!partyId || !viewer.partyIds) return false;
  return viewer.partyIds.includes(partyId);
}

/** The eyes on the table this reader looks through: their own, their party's, or whoever they share with. */
export function ownedSources(scene: VisionScene, viewer: SceneViewer): SceneVisionSource[] {
  return scene.visionSources.filter(
    (source) => viewerShares(viewer, source.owner, source.partyId) && source.type !== VisionType.BLIND
  );
}
