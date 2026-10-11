import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  EffectTargetingService,
  EffectTargetLink,
  EffectTargetMark,
} from '@axe/application/effect/effect-targeting.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';

const LINK_THICKNESS = 5;
const LINK_LIFT = 6;
const MARK_SIZE = 56;
const BADGE_SIZE = 26;

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

  protected areaStyle(area: { x: number; y: number; z: number; size: number }): Record<string, string> {
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
