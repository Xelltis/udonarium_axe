import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';

/** What a piece's menu says of the parts of others: the body it is a part of, or those it could be made one of. */
export interface PartMenuModel {
  /** The name of the piece this one is a part of, or null where it is a part of none. */
  readonly body: string | null;
  /** The pieces standing where this one stands that it could be made a part of. */
  readonly bodies: readonly { readonly id: string; readonly name: string }[];
  /** Whether the piece has parts of its own, whose look over it may be worked on. */
  readonly hasParts?: boolean;
  /** Whether the reader may work on how the parts look. */
  readonly canEditLook?: boolean;
}

/** What the part entries of a piece's menu do. */
export interface PartMenuCallbacks {
  attach(bodyId: string): void;
  /** Takes the piece off its body; none for a reader who may not, who is not offered it. */
  detach?(): void;
  /** Opens where the parts are drawn on their body's picture worked on. */
  editLook?(): void;
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
  const look: ContextMenuAction[] =
    model.canEditLook && callbacks.editLook && (model.body !== null || model.hasParts)
      ? [{ name: t('feature.ride.part.editLook'), action: () => callbacks.editLook?.() }]
      : [];
  if (model.body !== null) {
    const detach = callbacks.detach;
    return [
      ...(detach ? [{ name: t('feature.ride.part.detach', { body: model.body }), action: () => detach() }] : []),
      ...look,
    ];
  }
  return [
    ...model.bodies.map((body) => ({
      name: t('feature.ride.part.attach', { body: body.name }),
      action: () => callbacks.attach(body.id),
    })),
    ...look,
  ];
}
