import { InputHandler } from '@axe/ui/directives/input-handler';

export enum HandleType {
  N = 'n',
  E = 'e',
  W = 'w',
  S = 's',
  NE = 'ne',
  NW = 'nw',
  SE = 'se',
  SW = 'sw',
}

/**
 * One edge or corner of a resizable element: an invisible strip laid over it that listens for
 * presses, so dragging the strip resizes the element.
 */
export class ResizeHandler {
  /** The presses on this edge or corner. */
  readonly input: InputHandler;
  private readonly handle: HTMLElement;
  private readonly width = 12;

  constructor(
    readonly target: HTMLElement,
    readonly type: HandleType
  ) {
    this.handle = this.target.ownerDocument.createElement('div');
    this.handle.classList.add('ui-resize-handler-' + this.type);
    this.input = new InputHandler(this.handle);
    this.target.appendChild(this.handle);
    this.lay();
  }

  /** Lays the strip along its edge, or on its corner, outside the element's own box. */
  private lay() {
    const style = this.handle.style;
    style.position = 'absolute';
    style.zIndex = '1';
    style.backgroundColor = 'transparent';

    switch (this.type) {
      case HandleType.N:
        style.top = `${(-this.width * 3) / 4}px`;
        style.left = '0px';
        style.right = '0px';
        style.height = `${this.width}px`;
        style.cursor = 'ns-resize';
        break;
      case HandleType.E:
        style.top = '0px';
        style.bottom = '0px';
        style.right = `${(-this.width * 3) / 4}px`;
        style.width = `${this.width}px`;
        style.cursor = 'ew-resize';
        break;
      case HandleType.W:
        style.top = '0px';
        style.bottom = '0px';
        style.left = `${(-this.width * 3) / 4}px`;
        style.width = `${this.width}px`;
        style.cursor = 'ew-resize';
        break;
      case HandleType.S:
        style.bottom = `${(-this.width * 3) / 4}px`;
        style.left = '0px';
        style.right = '0px';
        style.height = `${this.width}px`;
        style.cursor = 'ns-resize';
        break;
      case HandleType.NE:
        style.top = `${(-this.width * 3) / 4}px`;
        style.right = `${(-this.width * 3) / 4}px`;
        style.width = `${(this.width * 3) / 2}px`;
        style.height = `${(this.width * 3) / 2}px`;
        style.cursor = 'nesw-resize';
        style.zIndex = '2';
        break;
      case HandleType.NW:
        style.top = `${(-this.width * 3) / 4}px`;
        style.left = `${(-this.width * 3) / 4}px`;
        style.width = `${(this.width * 3) / 2}px`;
        style.height = `${(this.width * 3) / 2}px`;
        style.cursor = 'nwse-resize';
        style.zIndex = '2';
        break;
      case HandleType.SE:
        style.bottom = `${(-this.width * 3) / 4}px`;
        style.right = `${(-this.width * 3) / 4}px`;
        style.width = `${(this.width * 3) / 2}px`;
        style.height = `${(this.width * 3) / 2}px`;
        style.cursor = 'nwse-resize';
        style.zIndex = '2';
        break;
      case HandleType.SW:
        style.bottom = `${(-this.width * 3) / 4}px`;
        style.left = `${(-this.width * 3) / 4}px`;
        style.width = `${(this.width * 3) / 2}px`;
        style.height = `${(this.width * 3) / 2}px`;
        style.cursor = 'nesw-resize';
        style.zIndex = '2';
        break;
    }
  }

  /** Removes the handle element from the target and stops listening for presses on it. */
  destroy() {
    this.handle.remove();
    this.input.destroy();
  }
}
