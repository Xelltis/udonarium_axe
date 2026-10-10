import { Injectable } from '@angular/core';
import { BACKDROP_REST_TILT_DEGREES, BackdropCamera } from '@axe/domain/tabletop/backdrop-offset';

/** Where a backdrop is moved to for the way the camera stands, as a transform. */
export type BackdropPlacement = (camera: BackdropCamera) => string;

/** How the camera stands before it has been moved, which is where a backdrop stands as it was put. */
const CAMERA_AT_REST: BackdropCamera = {
  rotateX: BACKDROP_REST_TILT_DEGREES,
  rotateZ: 0,
  positionX: 0,
  positionY: 0,
};

interface FramedBackdrop {
  place: BackdropPlacement;
  written: string | null;
}

/**
 * The register of the backdrops that follow the camera.
 *
 * Written in the frame that writes the table's own transform, as the parts that face the camera
 * are, so a backdrop slides with the turn and not a frame behind it. Only a transform is written,
 * which the screen moves without drawing the picture again.
 */
@Injectable({ providedIn: 'root' })
export class BackdropFrameService {
  private readonly framed = new Map<HTMLElement, FramedBackdrop>();
  private camera: BackdropCamera = CAMERA_AT_REST;

  /**
   * Adds a backdrop to the register, moved for the way the camera stands now.
   *
   * Hands back the way to take it off again.
   */
  register(element: HTMLElement, place: BackdropPlacement): () => void {
    const framed: FramedBackdrop = { place, written: null };
    this.framed.set(element, framed);
    this.move(element, framed);
    return () => {
      if (this.framed.get(element) === framed) this.framed.delete(element);
    };
  }

  /** Moves every backdrop on the register for a camera that now stands here. */
  apply(camera: BackdropCamera): void {
    this.camera = camera;
    for (const [element, framed] of this.framed) this.move(element, framed);
  }

  private move(element: HTMLElement, framed: FramedBackdrop): void {
    const transform = framed.place(this.camera);
    if (transform === framed.written) return;
    framed.written = transform;
    element.style.transform = transform;
  }
}
