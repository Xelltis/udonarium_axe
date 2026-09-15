import { ComponentRef, Injectable, Injector, signal, ViewContainerRef } from '@angular/core';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import type { PanelRotationDegrees } from '@axe/application/ui/panel.service';

class ModalContext {
  constructor(
    private _resolve: ((value: unknown) => void) | null,
    private _reject: ((reason?: unknown) => void) | null,
    public option?: unknown
  ) {}
  resolve(value: unknown) {
    this._resolve?.(value);
    this._resolve = null;
  }
  reject(reason?: unknown) {
    this._reject?.(reason);
    this._reject = null;
  }
}

@Injectable()
export class ModalService {
  private modalContext: ModalContext | null = null;
  private count = 0;
  private actionRotationDegrees: PanelRotationDegrees = 0;

  readonly rotationDegrees = signal<PanelRotationDegrees>(0);

  private readonly _title = signal('');
  /** The title the modal frame shows, taken from the option's `title` when the dialog opens. */
  get title(): string {
    return this._title();
  }
  set title(value: string) {
    this._title.set(value);
  }

  private readonly _titleTooltip = signal('');
  /** Tooltip text shown over the modal title. Empty for none. */
  get titleTooltip(): string {
    return this._titleTooltip();
  }
  set titleTooltip(value: string) {
    this._titleTooltip.set(value);
  }

  static defaultParentViewContainerRef: ViewContainerRef;
  static ModalComponentClass: { new (...args: unknown[]): unknown } = null!;
  /**
   * What the opener passed to `open`, for the dialog content to read its inputs from. Undefined
   * once the dialog has answered.
   */
  get option(): unknown {
    return this.modalContext?.option;
  }

  /** Whether any modal opened through this service is still up. */
  get isShow(): boolean {
    return this.count > 0;
  }

  /**
   * Opens a component inside the modal frame and resolves with whatever the dialog answers.
   *
   * The component is given a ModalService of its own, through which it reads `option` and calls
   * `resolve` or `reject`. A modal taken away unanswered, such as by closing the window it stood
   * in, resolves with null. Without a parent container it opens in the focused detached window's
   * layer, or the app's default layer.
   */
  open<T>(
    childComponent: { new (...args: unknown[]): unknown },
    option?: unknown,
    parentViewContainerRef?: ViewContainerRef
  ): Promise<T> {
    if (!parentViewContainerRef) {
      parentViewContainerRef = OverlayLayers.current() ?? ModalService.defaultParentViewContainerRef;
    }
    let panelComponentRef: ComponentRef<unknown>;
    return new Promise<T>((resolve, reject) => {
      let answered = false;
      // build an injector
      const _resolve = (val: T) => {
        if (panelComponentRef) {
          answered = true;
          panelComponentRef.destroy();
          resolve(val);
        }
      };

      const _reject = (reason?: unknown) => {
        if (panelComponentRef) {
          answered = true;
          panelComponentRef.destroy();
          reject(reason);
        }
      };

      const childModalService: ModalService = new ModalService();
      childModalService.modalContext = new ModalContext(_resolve as (val: unknown) => void, _reject, option);
      const rotationDegrees = this.optionRotationDegrees(option) ?? this.actionRotationDegrees;
      childModalService.rotationDegrees.set(rotationDegrees);
      childModalService.actionRotationDegrees = rotationDegrees;
      if (option != null && typeof option === 'object' && 'title' in option) {
        childModalService.title = ((option as Record<string, unknown>).title as string) ?? '';
      }

      const parentInjector = parentViewContainerRef.injector;
      const injector = Injector.create([{ provide: ModalService, useValue: childModalService }], parentInjector);

      panelComponentRef = parentViewContainerRef.createComponent(ModalService.ModalComponentClass, {
        index: parentViewContainerRef.length,
        injector,
      });
      (panelComponentRef.instance as { content: () => ViewContainerRef }).content().createComponent(childComponent);

      panelComponentRef.onDestroy(() => {
        this.count--;
        // A dialogue can be taken away without being answered: the window it was opened in is
        // shut, and the layer it stood in goes with it. Whoever is waiting is owed the answer
        // a dismissal gives — nothing chosen — or they wait for one that can never come.
        // Nothing rejects one of these in practice, and the callers read the value rather
        // than catching, so rejecting here would break them where going unanswered only
        // leaves them waiting.
        if (!answered) {
          answered = true;
          resolve(null as T);
        }
      });

      this.count++;
    });
  }

  /**
   * Runs an action so that modals it opens face the given side of the table.
   *
   * Menus on a table seen from above wrap their actions in this, so a dialog faces whoever opened
   * it. A `rotationDegrees` in the modal's own option still wins, and the previous rotation is put
   * back afterwards.
   */
  runWithInitialRotation<T>(rotationDegrees: PanelRotationDegrees, action: () => T): T {
    const previous = this.actionRotationDegrees;
    this.actionRotationDegrees = rotationDegrees;
    try {
      return action();
    } finally {
      this.actionRotationDegrees = previous;
    }
  }

  private optionRotationDegrees(option: unknown): PanelRotationDegrees | undefined {
    if (option == null || typeof option !== 'object' || !('rotationDegrees' in option)) return undefined;
    const degrees = (option as { rotationDegrees?: unknown }).rotationDegrees;
    return degrees === 0 || degrees === 90 || degrees === 180 || degrees === 270 ? degrees : undefined;
  }

  /** Answers the dialog with a value, which closes it. Only the first answer counts. */
  resolve(value?: unknown) {
    if (this.modalContext) {
      this.modalContext.resolve(value);
      this.modalContext = null;
    }
  }

  /** Rejects the dialog's promise, which closes it. Only the first answer counts. */
  reject(reason?: unknown) {
    if (this.modalContext) {
      this.modalContext.reject(reason);
      this.modalContext = null;
    }
  }
}
