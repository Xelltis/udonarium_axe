import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  EffectTargetingService,
  EffectTargetLink,
  EffectTargetMark,
} from '@axe/application/effect/effect-targeting.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { quadMatrix } from '@axe/domain/tabletop/world/page-boxes';

const LINK_THICKNESS = 5;
const LINK_LIFT = 6;
const MARK_SIZE = 56;
const BADGE_SIZE = 26;

/** A point of the floor, in table pixels. */
interface FloorPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What shows while targets are being chosen: the marks in order, and a line from the caster to each.
 *
 * The marks lie flat and only the numbers stand up; flat numbers cannot be read once the board is tilted.
 */
@Component({
  selector: 'effect-target-overlay',
  templateUrl: './effect-target-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [NgStyle],
})
export class EffectTargetOverlayComponent {
  private readonly targeting = inject(EffectTargetingService);
  private readonly uiSignalService = inject(UiSignalService);

  /**
   * Whether each picked piece is given its numbered badge. The first-person view leaves them off:
   * they are turned to face the table's camera, which that view does not look through, and its
   * pieces carry their own numbers.
   */
  readonly badges = input(true);
  /**
   * Whether the marks are laid over a table drawn on a canvas: what lies flat laid on the screen where
   * the canvas draws it at its height, and the numbers stood where the canvas draws the point they
   * stand at, rather than among the page's own pieces.
   */
  readonly overCanvas = input(false);

  private readonly camera = inject(TABLE_SCREEN);

  /**
   * How to lay an element over a canvas: one lying flat, from its corners on the floor at a height,
   * and one standing at a point, facing the screen. Follows the camera; null before it is set.
   */
  private readonly screen = computed(() => {
    const onScreen = this.camera.screenOf();
    if (!onScreen) return null;
    return {
      flat: (corners: readonly FloorPoint[], z: number, width: number, height: number): string | null => {
        const [a, b, c, d] = corners.map((corner) => onScreen(corner.x, corner.y, z));
        const matrix = quadMatrix(width, height, [a, b, c, d]);
        return matrix ? `matrix3d(${matrix.map((value) => Math.round(value * 1e6) / 1e6).join(', ')})` : null;
      },
      standing: (x: number, y: number, z: number): string => {
        const at = onScreen(x, y, z);
        return `translate(${at.x}px, ${at.y}px) scale(${at.scale}) translate(-50%, -50%)`;
      },
    };
  });

  readonly marks = computed<EffectTargetMark[]>(() => this.targeting.marks());

  /** How far it reaches, drawn once the piece at the centre is settled. */
  readonly area = computed<{ x: number; y: number; z: number; size: number } | null>(() => {
    const center = this.targeting.areaCenter();
    if (!center) return null;
    return { ...center, size: this.targeting.areaRadius() * 2 };
  });
  readonly links = computed<EffectTargetLink[]>(() => this.targeting.links());

  protected readonly color = computed<string>(() => this.targeting.preset()?.colorPrimary ?? '#ffd27f');
  protected readonly accent = computed<string>(() => this.targeting.preset()?.colorSecondary ?? '#ff5a33');

  /** The corners of a square lying flat round a middle, round from its top left. */
  private squareRound(x: number, y: number, size: number): FloorPoint[] {
    const half = size / 2;
    return [
      { x: x - half, y: y - half },
      { x: x + half, y: y - half },
      { x: x + half, y: y + half },
      { x: x - half, y: y + half },
    ];
  }

  /** A style laid over a canvas in place of the page's, or the page's own where it is not over one or cannot be laid. */
  private overCanvasOr(style: Record<string, string>, transform: () => string | null): Record<string, string> {
    if (!this.overCanvas()) return style;
    const laid = transform();
    return laid ? { ...style, transform: laid } : { ...style, display: 'none' };
  }

  protected areaStyle(area: { x: number; y: number; z: number; size: number }): Record<string, string> {
    return this.overCanvasOr(
      this.areaPageStyle(area),
      () => this.screen()?.flat(this.squareRound(area.x, area.y, area.size), area.z + 1, area.size, area.size) ?? null
    );
  }

  private areaPageStyle(area: { x: number; y: number; z: number; size: number }): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: area.size + 'px',
      height: area.size + 'px',
      'border-radius': '50%',
      border: `2px dashed ${this.color()}`,
      background: `radial-gradient(circle, ${this.accent()}22 0%, transparent 72%)`,
      'transform-origin': '0 0',
      transform: `translate3d(${area.x}px, ${area.y}px, ${area.z + 1}px) translate(-50%, -50%)`,
      'pointer-events': 'none',
    };
  }

  protected linkStyle(link: EffectTargetLink): Record<string, string> {
    return this.overCanvasOr(this.linkPageStyle(link), () => {
      const turn = (link.angle * Math.PI) / 180;
      const along = { x: Math.cos(turn), y: Math.sin(turn) };
      const across = { x: -along.y * (LINK_THICKNESS / 2), y: along.x * (LINK_THICKNESS / 2) };
      const length = Math.max(link.length, 1);
      const end = { x: link.x + along.x * length, y: link.y + along.y * length };
      return (
        this.screen()?.flat(
          [
            { x: link.x - across.x, y: link.y - across.y },
            { x: end.x - across.x, y: end.y - across.y },
            { x: end.x + across.x, y: end.y + across.y },
            { x: link.x + across.x, y: link.y + across.y },
          ],
          link.z + LINK_LIFT,
          length,
          LINK_THICKNESS
        ) ?? null
      );
    });
  }

  private linkPageStyle(link: EffectTargetLink): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: Math.max(link.length, 1) + 'px',
      height: LINK_THICKNESS + 'px',
      'border-radius': LINK_THICKNESS / 2 + 'px',
      background: `linear-gradient(90deg, ${this.accent()}, ${this.color()})`,
      opacity: '0.85',
      'transform-origin': '0 0',
      transform:
        `translate3d(${link.x}px, ${link.y}px, ${link.z + LINK_LIFT}px)` +
        ` rotateZ(${link.angle}deg) translateY(-50%)`,
      'pointer-events': 'none',
    };
  }

  protected markStyle(mark: EffectTargetMark): Record<string, string> {
    return this.overCanvasOr(
      this.markPageStyle(mark),
      () => this.screen()?.flat(this.squareRound(mark.x, mark.y, MARK_SIZE), mark.z + 1, MARK_SIZE, MARK_SIZE) ?? null
    );
  }

  private markPageStyle(mark: EffectTargetMark): Record<string, string> {
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: MARK_SIZE + 'px',
      height: MARK_SIZE + 'px',
      'border-radius': '50%',
      border: `3px solid ${this.color()}`,
      'box-shadow': `0 0 12px ${this.accent()}`,
      'transform-origin': '0 0',
      transform: `translate3d(${mark.x}px, ${mark.y}px, ${mark.z + 1}px) translate(-50%, -50%)`,
      'pointer-events': 'none',
    };
  }

  protected badgeStyle(mark: EffectTargetMark): Record<string, string> {
    return this.overCanvasOr(
      this.badgePageStyle(mark),
      () => this.screen()?.standing(mark.x, mark.y, mark.z + MARK_SIZE) ?? null
    );
  }

  private badgePageStyle(mark: EffectTargetMark): Record<string, string> {
    const rotation = this.uiSignalService.tableViewRotation();
    return {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: BADGE_SIZE + 'px',
      height: BADGE_SIZE + 'px',
      'border-radius': '50%',
      background: this.color(),
      color: '#1b1b1b',
      font: 'bold 15px/26px sans-serif',
      'text-align': 'center',
      'transform-origin': '0 0',
      transform:
        `translate3d(${mark.x}px, ${mark.y}px, ${mark.z + MARK_SIZE}px)` +
        ` rotateZ(${-(rotation?.z ?? 10)}deg) rotateX(${-(rotation?.x ?? 50)}deg)` +
        ` rotateY(${-(rotation?.y ?? 0)}deg) translate(-50%, -50%)`,
      'pointer-events': 'none',
    };
  }
}
