import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable } from '@angular/core';
import { AlphaMask, picturePointOf, seesThroughAt } from '@axe/domain/ui/see-through';
import { readAlphaMask } from '@axe/infrastructure/image/alpha-mask-reader';

/** How many pictures' masks are kept, well above the faces one table shows. */
const MASK_CACHE_LIMIT = 256;

/**
 * How long the pictures a touch went through stay open once the finger lifts, so the click the tap
 * raises lands where the press did.
 */
const TOUCH_HOLE_MS = 400;

/** How many pictures stacked one behind another a press goes through before it stops at one. */
const MAX_LAYERS = 8;

/** An event sent to an element for nothing but where a point of the screen falls in its own box. */
const PROBE_EVENT = 'axe-see-through-probe';

interface TouchThrough {
  readonly pointerId: number;
  /** The pictures the touch went through, the one it first landed on first. */
  readonly through: readonly HTMLImageElement[];
  /** What is under them, which the press is handed to. */
  readonly landsOn: Element | null;
}

/**
 * Lets a press on the clear parts of a piece's picture land on whatever is beneath, as though the
 * picture were not there.
 *
 * A picture is opened by taking it out of the page's hit testing while the pointer is over a clear
 * part of it, so the browser hands the press, the drag, the right click, the cursor and the hover to
 * what is under it; it is closed again once the pointer moves onto the figure or off the picture. A
 * touch has no hover before it, so a touch on a clear part is handed on as it lands. A picture not
 * yet loaded, or one the page may not read, holds every press as it always has.
 */
@Injectable({ providedIn: 'root' })
export class SeeThroughService {
  private readonly document = inject(DOCUMENT);
  private readonly masks = new Map<string, AlphaMask | null>();
  private readonly pictures = new WeakSet<HTMLImageElement>();
  private readonly fits = new WeakMap<HTMLImageElement, string>();
  private readonly holes = new Set<HTMLImageElement>();
  private touch: TouchThrough | null = null;
  private touchTimer: ReturnType<typeof setTimeout> | null = null;
  private touchForwarding: boolean | null = null;

  constructor() {
    const doc = this.document;
    doc.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true });
    doc.addEventListener('pointerdown', this.onPointerDown, true);
    doc.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: false });
    doc.addEventListener('pointerup', this.onPointerEnd, true);
    doc.addEventListener('pointercancel', this.onPointerEnd, true);
    inject(DestroyRef).onDestroy(() => {
      doc.removeEventListener('pointermove', this.onPointerMove, true);
      doc.removeEventListener('pointerdown', this.onPointerDown, true);
      doc.removeEventListener('touchstart', this.onTouchStart, true);
      doc.removeEventListener('pointerup', this.onPointerEnd, true);
      doc.removeEventListener('pointercancel', this.onPointerEnd, true);
      this.clearTouchTimer();
      for (const hole of [...this.holes]) this.close(hole);
    });
  }

  /** Lets presses through the clear parts of a picture from now on. */
  watch(picture: HTMLImageElement): void {
    this.pictures.add(picture);
  }

  /** Has a picture hold every press again, as one no longer drawn. */
  unwatch(picture: HTMLImageElement): void {
    this.pictures.delete(picture);
    this.fits.delete(picture);
    this.close(picture);
  }

  /** Opens a picture the pointer is over, with no button held, where it is clear under the pointer. */
  hover(picture: HTMLImageElement, x: number, y: number): void {
    if (this.pictures.has(picture) && this.seesThrough(picture, x, y)) this.open(picture);
  }

  /** Whether a picture is open just now, letting presses through. */
  isOpen(picture: HTMLImageElement): boolean {
    return this.holes.has(picture);
  }

  /**
   * Whether a press at a point of a picture's box, in the box's own pixels, passes through it: off
   * the picture drawn in the box, or where the picture is all but clear.
   */
  seesThrough(picture: HTMLImageElement, x: number, y: number): boolean {
    const mask = this.maskOf(picture);
    if (!mask) return false;
    const point = picturePointOf(
      { width: picture.clientWidth, height: picture.clientHeight },
      { width: picture.naturalWidth, height: picture.naturalHeight },
      this.fitOf(picture),
      x,
      y
    );
    return point !== null && seesThroughAt(mask, point);
  }

  /**
   * How opaque a picture is at each point, read off it the first time it is asked for and kept by
   * its address. Null while it is still loading, and for good where the page may not read it.
   */
  maskOf(picture: HTMLImageElement): AlphaMask | null {
    const url = picture.currentSrc || picture.src;
    if (!url) return null;
    const held = this.masks.get(url);
    if (held !== undefined) return held;
    if (!picture.complete || !(picture.naturalWidth > 0)) return null;
    const mask = this.read(picture);
    if (this.masks.size >= MASK_CACHE_LIMIT) {
      const oldest = this.masks.keys().next().value;
      if (oldest !== undefined) this.masks.delete(oldest);
    }
    this.masks.set(url, mask);
    return mask;
  }

  /** Reads a loaded picture's mask. */
  protected read(picture: HTMLImageElement): AlphaMask | null {
    return readAlphaMask(picture, picture.naturalWidth, picture.naturalHeight);
  }

  /**
   * Where a point of the screen falls in an element's own box, through whatever turns, tips and
   * scales it on the way to the screen, as the browser works it out for an event sent to it.
   */
  protected offsetOf(element: Element, clientX: number, clientY: number): { x: number; y: number } | null {
    let at: { x: number; y: number } | null = null;
    const listener = (event: Event) => {
      const probe = event as MouseEvent;
      at = { x: probe.offsetX, y: probe.offsetY };
    };
    element.addEventListener(PROBE_EVENT, listener);
    element.dispatchEvent(new MouseEvent(PROBE_EVENT, { clientX, clientY }));
    element.removeEventListener(PROBE_EVENT, listener);
    return at;
  }

  /** What the page's hit testing finds at a point of the screen, with the open pictures left out. */
  protected elementAt(clientX: number, clientY: number): Element | null {
    return this.document.elementFromPoint(clientX, clientY);
  }

  /** Whether a point of a picture's box is in the box and on a clear part of the picture. */
  private clearAt(picture: HTMLImageElement, clientX: number, clientY: number): boolean {
    const at = this.offsetOf(picture, clientX, clientY);
    if (!at) return false;
    if (at.x < 0 || at.y < 0 || at.x >= picture.clientWidth || at.y >= picture.clientHeight) return false;
    return this.seesThrough(picture, at.x, at.y);
  }

  private fitOf(picture: HTMLImageElement): string {
    let fit = this.fits.get(picture);
    if (fit === undefined) {
      fit = this.document.defaultView?.getComputedStyle(picture).objectFit ?? 'fill';
      this.fits.set(picture, fit);
    }
    return fit;
  }

  private open(picture: HTMLImageElement): void {
    if (this.holes.has(picture)) return;
    picture.style.pointerEvents = 'none';
    this.holes.add(picture);
  }

  private close(picture: HTMLImageElement): void {
    if (!this.holes.delete(picture)) return;
    picture.style.pointerEvents = '';
  }

  /** Closes the pictures a mouse or pen has moved off the clear parts of, or off altogether. */
  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.holes.size === 0 || event.pointerType === 'touch') return;
    for (const hole of [...this.holes]) {
      if (this.touch?.through.includes(hole)) continue;
      if (!hole.isConnected || !this.clearAt(hole, event.clientX, event.clientY)) this.close(hole);
    }
  };

  /**
   * Hands a touch on a clear part of a picture to what is beneath it. The pictures it goes through
   * are opened first, and let go of the touch, so what follows it is found where the finger is.
   */
  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    const picture = event.target;
    if (!(picture instanceof HTMLImageElement) || !this.pictures.has(picture)) return;
    if (!this.canForwardTouch() || !this.seesThrough(picture, event.offsetX, event.offsetY)) return;
    event.stopImmediatePropagation();
    letGoOf(picture, event.pointerId);
    this.open(picture);
    const through = [picture];
    let landsOn = this.elementAt(event.clientX, event.clientY);
    while (
      landsOn instanceof HTMLImageElement &&
      this.pictures.has(landsOn) &&
      through.length < MAX_LAYERS &&
      this.clearAt(landsOn, event.clientX, event.clientY)
    ) {
      this.open(landsOn);
      through.push(landsOn);
      landsOn = this.elementAt(event.clientX, event.clientY);
    }
    this.clearTouchTimer();
    this.touch = { pointerId: event.pointerId, through, landsOn };
    landsOn?.dispatchEvent(new PointerEvent(event.type, event));
  };

  /** Hands the touch that started on a picture a touch went through to what is beneath it. */
  private readonly onTouchStart = (event: TouchEvent) => {
    const touch = this.touch;
    const first = touch?.through[0];
    if (!touch || !first || event.target !== first) return;
    event.stopImmediatePropagation();
    const landsOn = touch.landsOn;
    if (!landsOn) return;
    const handOn = (one: Touch) => (one.target === first ? retargeted(one, landsOn) : one);
    const forwarded = new TouchEvent(event.type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      touches: Array.from(event.touches, handOn),
      targetTouches: Array.from(event.targetTouches, handOn),
      changedTouches: Array.from(event.changedTouches, handOn),
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
    landsOn.dispatchEvent(forwarded);
    if (forwarded.defaultPrevented && event.cancelable) event.preventDefault();
  };

  /** Closes what a touch went through a moment after the finger lifts. */
  private readonly onPointerEnd = (event: PointerEvent) => {
    const touch = this.touch;
    if (!touch || event.pointerId !== touch.pointerId) return;
    this.clearTouchTimer();
    this.touchTimer = setTimeout(() => {
      this.touchTimer = null;
      if (this.touch !== touch) return;
      this.touch = null;
      for (const picture of touch.through) this.close(picture);
    }, TOUCH_HOLE_MS);
  };

  private clearTouchTimer(): void {
    if (this.touchTimer === null) return;
    clearTimeout(this.touchTimer);
    this.touchTimer = null;
  }

  /**
   * Whether this browser can make a touch to hand on. One that cannot leaves a touch on the picture
   * it landed on, as before.
   */
  private canForwardTouch(): boolean {
    if (this.touchForwarding === null) {
      try {
        const probe = new Touch({ identifier: 0, target: this.document.body });
        new TouchEvent('touchstart', { changedTouches: [probe] });
        this.touchForwarding = true;
      } catch {
        this.touchForwarding = false;
      }
    }
    return this.touchForwarding;
  }
}

/** The same touch, landing on another element. */
function retargeted(touch: Touch, target: Element): Touch {
  return new Touch({
    identifier: touch.identifier,
    target,
    clientX: touch.clientX,
    clientY: touch.clientY,
    screenX: touch.screenX,
    screenY: touch.screenY,
    pageX: touch.pageX,
    pageY: touch.pageY,
    radiusX: touch.radiusX,
    radiusY: touch.radiusY,
    rotationAngle: touch.rotationAngle,
    force: touch.force,
  });
}

/** Lets go of a pointer an element holds, as a touch is held by what it first lands on. */
function letGoOf(element: Element, pointerId: number): void {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    return;
  }
}
