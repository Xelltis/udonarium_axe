import { ComponentRef, Injectable, reflectComponentType, signal, ViewContainerRef } from '@angular/core';
import { EventChannel } from '@axe/core/event/event-channel';
import { Logger } from '@axe/core/logging/logger';
import { CardStack } from '@axe/domain/card/card-stack';
import { ChatTab } from '@axe/domain/chat/chat-tab';

declare const Type: FunctionConstructor;
interface Type<T> {
  new (...args: unknown[]): T;
}

export type PanelRotationDegrees = 0 | 90 | 180 | 270;

function panelKindOf(childComponent: Type<unknown>): string {
  const selector = reflectComponentType(childComponent as never)?.selector;
  return selector && selector.length > 0 ? selector : '';
}

/**
 * A button the panel's content asks to stand in the title bar.
 *
 * A panel of any kind wears the same frame, so what a particular one offers - following the
 * newest line, taking the box off - has nowhere of its own to sit. The content hands these
 * over and the frame draws them beside its own.
 */
export interface PanelHeaderControl {
  /** The material icon drawn on it. */
  icon: string;
  label: string;
  active: boolean;
  press: () => void;
}

export interface PanelOption {
  title?: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  rotationDegrees?: PanelRotationDegrees;

  isCutIn?: boolean;
  cutInIdentifier?: string;
  invisible?: boolean;
  minimizeToContent?: boolean;
  frameless?: boolean;

  /**
   * Where this panel sits, for one opened by something that lives above where panels go.
   *
   * Left out, the panel takes its turn among the others as the reader brings them forward.
   */
  layer?: number;

  /**
   * A name that only one panel at a time may hold.
   *
   * A button that opens a panel under this name can close it again with `closeSingle`, so
   * pressing it twice puts the panel away rather than burying the screen in copies of it.
   */
  single?: string;
}

interface UIPanelInstance {
  content: () => ViewContainerRef;
  setInitialRotation: (degrees: PanelRotationDegrees) => void;
}

type PanelServiceAssignableKey =
  | 'layer'
  | 'title'
  | 'top'
  | 'left'
  | 'width'
  | 'height'
  | 'minWidth'
  | 'minHeight'
  | 'isCutIn'
  | 'cutInIdentifier'
  | 'invisible'
  | 'minimizeToContent'
  | 'frameless';

@Injectable()
export class PanelService {
  static defaultParentViewContainerRef: ViewContainerRef;
  static UIPanelComponentClass: { new (...args: unknown[]): UIPanelInstance } = null!;
  static chatPortraitComponentClass: Type<unknown> | null = null;
  static cardStackListComponentClass: Type<unknown> | null = null;
  private panelComponentRef: ComponentRef<UIPanelInstance> | null = null;
  private actionRotationDegrees: PanelRotationDegrees = 0;
  private static readonly singles = new Map<string, ComponentRef<UIPanelInstance>>();
  /** Names spoken for by a panel whose code is still being fetched. */
  private static readonly opening = new Set<string>();
  /**
   * Bumped whenever a name is spoken for or let go of, so that `hasSingle` can be followed.
   *
   * A button that opens a panel has to know when that panel goes, and it goes by ways the
   * button never hears about: its own close box, another panel taking the name, the reader
   * pressing escape. Answering from a flag the button sets itself leaves it lit over a panel
   * that is no longer there, and the next press opens what it meant to close.
   */
  private static readonly singlesVersion = signal(0);
  title: string = '';
  titleTooltip: string = '';
  left: number = 0;
  top: number = 0;
  width: number = 100;
  height: number = 100;
  minWidth: number = 100;
  minHeight: number = 100;
  isCutIn: boolean = false;
  cutInIdentifier: string = '';
  /** Zero for a panel that takes its turn among the others, which is nearly all of them. */
  layer: number = 0;
  invisible: boolean = false;
  minimizeToContent: boolean = false;
  frameless: boolean = false;
  readonly isMinimized = signal(false);
  /** Buttons the content put in the title bar, beside the ones every panel wears. */
  readonly headerControls = signal<readonly PanelHeaderControl[]>([]);
  /**
   * Standing with its box taken off: no ground, no frame, no title, only what it holds.
   *
   * The buttons are drawn to stand out instead, since they are all that is left to work it by.
   */
  readonly isGhost = signal(false);
  /** What kind of panel this is, taken from the selector of what it was opened with. */
  readonly panelKind = signal('');
  chatTab: ChatTab | null = null;
  cardStack: CardStack | null = null;
  scrollablePanel: HTMLDivElement | null = null;
  private isScrollablePanelClaimed = false;
  readonly scrollToBottom$ = new EventChannel<void>();
  /**
   * Asks the frame to grow to a size, or to give back the one it had.
   *
   * The frame owns the size - it is written on the panel's own element and remembered across a
   * shrink - so the content asks rather than writing it, the way it asks to be minimised.
   */
  readonly resizeRequest$ = new EventChannel<{ width: number; height: number } | null>();
  /**
   * Asks the frame to shrink the panel, or to let it out again.
   *
   * Shrinking is the frame's own doing - it puts the panel's size aside to give back - so the
   * content asks rather than writing `isMinimized` itself, which would leave the panel its
   * full size with nothing drawn in it.
   */
  readonly minimizeRequest$ = new EventChannel<boolean>();
  get isShow(): boolean {
    return this.panelComponentRef !== null;
  }

  setDefaultScrollablePanel(panel: HTMLDivElement): void {
    if (this.isScrollablePanelClaimed) return;
    this.scrollablePanel = panel;
  }

  claimScrollablePanel(panel: HTMLDivElement): void {
    this.isScrollablePanelClaimed = true;
    this.scrollablePanel = panel;
  }

  /**
   * Closes the panel holding this name, and says whether there was one to close.
   *
   * A panel still on its way counts as one: a name asked for and not yet arrived is taken
   * back, and the panel is dropped when it lands rather than opening after the reader has
   * asked it to go away.
   */
  closeSingle(name: string): boolean {
    if (PanelService.opening.delete(name)) {
      PanelService.noteSingles();
      return true;
    }

    const open = PanelService.singles.get(name);
    if (!open) return false;
    open.destroy();
    return true;
  }

  private static noteSingles(): void {
    PanelService.singlesVersion.update((version) => version + 1);
  }

  /**
   * Whether a panel is standing under this name.
   *
   * `closeSingle` answers the same question but shuts the panel to do it, which is no use to
   * anything that only wants to know. One still being opened counts as open, for the same
   * reason it does there.
   */
  hasSingle(name: string): boolean {
    PanelService.singlesVersion();
    return PanelService.opening.has(name) || PanelService.singles.has(name);
  }

  open<T>(childComponent: Type<T>, option?: PanelOption, parentViewContainerRef?: ViewContainerRef): T {
    if (!parentViewContainerRef) {
      parentViewContainerRef = PanelService.defaultParentViewContainerRef;
    }
    const injector = parentViewContainerRef.injector;

    if (option?.single) PanelService.singles.get(option.single)?.destroy();

    const panelComponentRef = parentViewContainerRef.createComponent(PanelService.UIPanelComponentClass, {
      index: parentViewContainerRef.length,
      injector,
    });
    const bodyComponentRef: ComponentRef<T> = panelComponentRef.instance.content().createComponent(childComponent);

    const childPanelService: PanelService = panelComponentRef.injector.get(PanelService);

    childPanelService.panelComponentRef = panelComponentRef;
    childPanelService.panelKind.set(panelKindOf(childComponent));
    const inheritedOption = this.withInheritedRotation(option, this.actionRotationDegrees);
    if (inheritedOption) this.applyPanelOption(panelComponentRef, childPanelService, inheritedOption);
    const single = option?.single;
    if (single) {
      PanelService.singles.set(single, panelComponentRef);
      PanelService.noteSingles();
    }
    panelComponentRef.onDestroy(() => {
      childPanelService.panelComponentRef = null;
      if (single && PanelService.singles.get(single) === panelComponentRef) {
        PanelService.singles.delete(single);
        PanelService.noteSingles();
      }
    });

    return bodyComponentRef.instance as T;
  }

  openLazy<T>(
    factory: () => Promise<Type<T>>,
    option?: PanelOption,
    setup?: (instance: T) => void,
    parentViewContainerRef?: ViewContainerRef
  ): void {
    const inheritedOption = this.withInheritedRotation(option, this.actionRotationDegrees);
    // A panel that fails to arrive says nothing for itself: the promise rejects into nowhere
    // and the reader is left looking at a menu item that appears to do nothing.
    const single = option?.single;
    if (single) {
      PanelService.opening.add(single);
      PanelService.noteSingles();
    }

    factory()
      .then((childComponent) => {
        // Asked to close while it was being fetched, it never opens at all.
        if (single && !PanelService.opening.delete(single)) return;

        const instance = this.open(childComponent, inheritedOption, parentViewContainerRef);
        setup?.(instance);
      })
      .catch((reason) => {
        // The name is let go of as well, or nothing under it could ever be opened again.
        if (single) PanelService.opening.delete(single);
        Logger.error('[PanelService] パネルを開けませんでした', reason);
      })
      .finally(() => {
        if (single) PanelService.noteSingles();
      });
  }

  runWithInitialRotation<T>(rotationDegrees: PanelRotationDegrees, action: () => T): T {
    const previous = this.actionRotationDegrees;
    this.actionRotationDegrees = rotationDegrees;
    try {
      return action();
    } finally {
      this.actionRotationDegrees = previous;
    }
  }

  private applyPanelOption(
    panelComponentRef: ComponentRef<UIPanelInstance>,
    childPanelService: PanelService,
    option: PanelOption
  ) {
    const adjusted = PanelService.clampPanelOptionToViewport(option, childPanelService);
    const withInput = ['title', 'top', 'left', 'width', 'height', 'minWidth', 'minHeight'] as const;
    for (const key of withInput) {
      const value = adjusted[key];
      if (value === undefined) continue;
      this.setPanelServiceValue(childPanelService, key, value);
      panelComponentRef.setInput(key, value);
    }

    const serviceOnly = ['isCutIn', 'cutInIdentifier', 'invisible', 'minimizeToContent', 'frameless', 'layer'] as const;
    for (const key of serviceOnly) {
      const value = adjusted[key];
      if (value === undefined) continue;
      this.setPanelServiceValue(childPanelService, key, value);
    }
    if (adjusted.rotationDegrees !== undefined) {
      panelComponentRef.instance.setInitialRotation(adjusted.rotationDegrees);
    }
  }

  private withInheritedRotation(
    option: PanelOption | undefined,
    rotationDegrees: PanelRotationDegrees
  ): PanelOption | undefined {
    if (option?.rotationDegrees !== undefined || rotationDegrees === 0) return option;
    return { ...option, rotationDegrees };
  }

  static clampPanelOptionToViewport(option: PanelOption, fallback: PanelService): PanelOption {
    if (typeof window === 'undefined') return option;
    const width = option.width ?? fallback.width;
    const height = option.height ?? fallback.height;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const adjusted: PanelOption = { ...option };
    const sideways = option.rotationDegrees === 90 || option.rotationDegrees === 270;
    if (sideways && option.left !== undefined && option.top !== undefined) {
      const visualWidth = height;
      const visualHeight = width;
      const centerX = option.left + width / 2;
      const centerY = option.top + height / 2;
      const clampedCenterX =
        visualWidth >= viewportW
          ? viewportW / 2
          : Math.max(visualWidth / 2, Math.min(centerX, viewportW - visualWidth / 2));
      const clampedCenterY =
        visualHeight >= viewportH
          ? viewportH / 2
          : Math.max(visualHeight / 2, Math.min(centerY, viewportH - visualHeight / 2));
      adjusted.left = clampedCenterX - width / 2;
      adjusted.top = clampedCenterY - height / 2;
      return adjusted;
    }
    if (option.left !== undefined) {
      const maxLeft = Math.max(0, viewportW - width);
      adjusted.left = Math.max(0, Math.min(option.left, maxLeft));
    }
    if (option.top !== undefined) {
      const maxTop = Math.max(0, viewportH - height);
      adjusted.top = Math.max(0, Math.min(option.top, maxTop));
    }
    return adjusted;
  }

  private setPanelServiceValue<K extends PanelServiceAssignableKey>(
    panelService: PanelService,
    key: K,
    value: PanelService[K]
  ) {
    panelService[key] = value;
  }

  close() {
    if (this.panelComponentRef) {
      this.panelComponentRef.destroy();
      this.panelComponentRef = null;
    }
  }
}
