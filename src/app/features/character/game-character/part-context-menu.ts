import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** What a piece's menu says of the parts of others: the body it is a part of, or those it could be made one of. */
export interface PartMenuModel {
  /** The name of the piece this one is a part of, or null where it is a part of none. */
  readonly body: string | null;
  /** The pieces standing where this one stands that it could be made a part of. */
  readonly bodies: readonly { readonly id: string; readonly name: string }[];
}

/** What the part entries of a piece's menu do. */
export interface PartMenuCallbacks {
  attach(bodyId: string): void;
  detach(): void;
}

/**
 * The entries of a piece's menu about being a part of another, offered beside getting on and off a
 * mount: taking the piece off the body it is a part of, or making it a part of one it stands on.
 */
export function buildPartContextMenu(
  model: PartMenuModel,
  callbacks: PartMenuCallbacks,
  t: TranslateFn
): ContextMenuAction[] {
  if (model.body !== null) {
    return [{ name: t('feature.ride.part.detach', { body: model.body }), action: () => callbacks.detach() }];
  }
  return model.bodies.map((body) => ({
    name: t('feature.ride.part.attach', { body: body.name }),
    action: () => callbacks.attach(body.id),
  }));
}
