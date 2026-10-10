import { ComponentRef, Injectable, InjectionToken, Injector, Type, ViewContainerRef } from '@angular/core';
import { ModalService } from '@axe/application/ui/modal.service';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';

/** How a sheet opens: what it is called, how tall it is, and what opened it. */
export interface BottomSheetOptions {
  /** The heading over the sheet, already translated. */
  title: string;
  /** `auto` fits the content, up to most of the screen; `full` takes the height whatever it holds. */
  size?: 'auto' | 'full';
  /**
   * The element the sheet was opened from. The sheet opens in that element's window, and above the
   * panel it stands in.
   */
  host?: Element | null;
  /** Inputs set on the content component as it is made. */
  inputs?: Record<string, unknown>;
  /** The injector the content resolves its services from, such as the opener's own. */
  injector?: Injector;
  /** Where the sheet is drawn; the host's window, or the app's overlay layer, when left out. */
  layer?: ViewContainerRef;
}

/** The options a sheet's frame reads, with the host's stacking already worked out. */
export interface BottomSheetFrameOptions {
  title: string;
  size: 'auto' | 'full';
  /** The z-index the sheet stands at. */
  zIndex: number;
}

export const BOTTOM_SHEET_FRAME_OPTIONS = new InjectionToken<BottomSheetFrameOptions>('BOTTOM_SHEET_FRAME_OPTIONS');

/** Where a sheet stands, above the panels and below the menus and dialogs it may open. */
export const Z_BOTTOM_SHEET = 1000;

/**
 * The z-index for a sheet opened from a panel at the given z-index: its usual place, or just above
 * a panel that stands higher, such as one opened from a pinned bar.
 */
export function bottomSheetLayer(hostLayer: number | null): number {
  return hostLayer !== null && hostLayer >= Z_BOTTOM_SHEET ? hostLayer + 1 : Z_BOTTOM_SHEET;
}

/** The z-index of the panel an element stands in, or null outside one that has its own. */
export function hostPanelLayer(host: Element | null | undefined): number | null {
  const layered = host?.closest('[data-z-layer]');
  const layer = Number(layered?.getAttribute('data-z-layer'));
  return Number.isFinite(layer) && layer > 0 ? layer : null;
}

/**
 * A sheet that is open, for whoever opened it and for the content inside it.
 *
 * The content injects it to close the sheet, with an answer or without one.
 */
export class BottomSheetRef<R = unknown> {
  private settle!: (result: R | null) => void;
  private dispose: (() => void) | null = null;
  private isClosed = false;

  /** Resolves once the sheet is gone: with what the content answered, or null when it was dismissed. */
  readonly closed: Promise<R | null> = new Promise<R | null>((resolve) => (this.settle = resolve));

  /** Closes the sheet. Only the first answer counts. */
  close(result: R | null = null): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.settle(result);
    const dispose = this.dispose;
    this.dispose = null;
    dispose?.();
  }

  /** Whether the sheet has closed. */
  get isOpen(): boolean {
    return !this.isClosed;
  }

  /** Hands the ref the way to take the sheet down, once it is drawn. */
  attach(dispose: () => void): void {
    this.dispose = dispose;
  }
}

/**
 * Opens a component in a sheet that rises from the bottom of the screen.
 *
 * On a phone a sheet is where a row's settings and actions are worked on, out of the narrow row
 * itself; on a wider screen the same sheet stands in the middle as a dialog. It opens in the
 * overlay layer like menus and dialogs do, because a sheet drawn inside the panel would be held by
 * the panel's own layout.
 */
@Injectable({ providedIn: 'root' })
export class BottomSheetService {
  /** The frame the content is drawn in, registered by the app so this layer does not import it. */
  static frameComponentClass: Type<{ content: () => ViewContainerRef }> | null = null;

  private readonly open$: BottomSheetRef[] = [];

  /** Opens a component in a sheet, and returns the open sheet. */
  open<R = unknown>(component: Type<unknown>, options: BottomSheetOptions): BottomSheetRef<R> {
    const ref = new BottomSheetRef<R>();
    const frameClass = BottomSheetService.frameComponentClass;
    const layer =
      options.layer ??
      OverlayLayers.layerFor(options.host?.ownerDocument) ??
      OverlayLayers.current() ??
      ModalService.defaultParentViewContainerRef;
    if (!frameClass || !layer) {
      ref.close(null);
      return ref;
    }

    const frameOptions: BottomSheetFrameOptions = {
      title: options.title,
      size: options.size ?? 'auto',
      zIndex: bottomSheetLayer(hostPanelLayer(options.host)),
    };
    const injector = Injector.create({
      providers: [
        { provide: BottomSheetRef, useValue: ref },
        { provide: BOTTOM_SHEET_FRAME_OPTIONS, useValue: frameOptions },
      ],
      parent: options.injector ?? layer.injector,
    });

    const frame: ComponentRef<{ content: () => ViewContainerRef }> = layer.createComponent(frameClass, {
      index: layer.length,
      injector,
    });
    frame.changeDetectorRef.detectChanges();
    const content = frame.instance.content().createComponent(component, { injector });
    for (const [name, value] of Object.entries(options.inputs ?? {})) content.setInput(name, value);

    this.open$.push(ref as BottomSheetRef);
    ref.attach(() => frame.destroy());
    frame.onDestroy(() => {
      const index = this.open$.indexOf(ref as BottomSheetRef);
      if (index >= 0) this.open$.splice(index, 1);
      ref.close(null);
    });
    return ref;
  }

  /** Whether any sheet is open. */
  get isOpen(): boolean {
    return this.open$.length > 0;
  }

  /** Closes every open sheet unanswered, as leaving the sheet's panel does. */
  closeAll(): void {
    for (const ref of [...this.open$]) ref.close(null);
  }
}
