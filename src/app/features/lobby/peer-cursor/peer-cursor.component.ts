import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { BatchService } from '@axe/application/ui/batch.service';
import { callCursorMove } from '@axe/core/event/domain-events';
import { getPeerIds } from '@axe/core/network/peer-context-source';
import { ResettableTimeout } from '@axe/core/util/resettable-timeout';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole, roleShortLabelKey, roleTagClass } from '@axe/domain/peer/peer-role';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** How long a cursor that has stopped moving stays in sight. */
const FADE_OUT_AFTER_MS = 3000;
/** The least a cursor's movement is held back before it is sent. */
const MIN_MOVE_DELAY_MS = 100;
/** What each connected peer adds to that hold, a frame's worth. */
const MOVE_DELAY_PER_PEER_MS = 16.6;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'peer-cursor, [peer-cursor]',
  templateUrl: './peer-cursor.component.html',
  host: { class: 'block' },
  imports: [SafePipe],
})
export class PeerCursorComponent {
  private readonly batchService = inject(BatchService);
  private readonly tablePick = inject(TablePickService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly camera = inject(TableCameraService);
  private readonly surfaces = inject(TableSurfaceService);

  readonly cursorElementRef = viewChild<ElementRef>('cursor');
  readonly opacityElementRef = viewChild<ElementRef>('opacity');
  readonly cursor = input(PeerCursor.myCursor);

  readonly iconUrl = computed(() => {
    this.objectChange.fileVersion();
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().image?.url ?? '';
  });
  readonly showRoleBadge = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().role !== PeerRole.Player;
  });
  readonly roleBadgeText = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.t(roleShortLabelKey(this.cursor().role));
  });
  readonly roleBadgeClass = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return roleTagClass(this.cursor().role);
  });

  readonly name = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor().name;
  });
  readonly isMine = computed(() => {
    this.objectChange.versionOf(this.cursor().identifier)();
    return this.cursor()?.isMine ?? false;
  });
  private cursorElement: HTMLElement | null = null;
  private opacityElement: HTMLElement | null = null;
  private fadeOutTimer: ResettableTimeout | null = null;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  private onMoveListener: (e: Event) => void = (e) => this.onMouseMove(e);

  private _x = 0;
  private _y = 0;
  private _target!: HTMLElement;
  /** The point of the floor the cursor was last put at, laid on the screen again as the camera moves over a canvas. */
  private at: { x: number; y: number; z: number } | null = null;

  /**
   * How long cursor movement is held back before being sent or animated, in milliseconds: 16.6 per
   * connected peer, never under 100, so a crowded room sends less often.
   */
  get delayMs(): number {
    return Math.max(MIN_MOVE_DELAY_MS, getPeerIds().length * MOVE_DELAY_PER_PEER_MS);
  }

  constructor() {
    this.objectChange.cursorMove$.subscribe((event) => {
      if (event.sendFrom !== this.cursor().peerId) return;
      if (!this.cursorElement) return;
      this.batchService.add(() => {
        this.stopTransition();
        this.setAnimatedTransition();
        this.setPosition(event.x, event.y, event.z);
        this.resetFadeOut();
      }, this);
    }, this.destroyRef);

    effect(() => {
      this.camera.version();
      untracked(() => {
        if (!this.at || !this.cursorElement) return;
        this.cursorElement.style.transition = 'opacity 0.5s ease-out';
        this.layOnScreen();
      });
    });

    afterNextRender(() => {
      if (this.isMine()) {
        document.body.addEventListener('mousemove', this.onMoveListener);
        document.body.addEventListener('touchmove', this.onMoveListener);
      } else {
        this.cursorElement = this.cursorElementRef()?.nativeElement;
        this.opacityElement = this.opacityElementRef()?.nativeElement;
        this.setAnimatedTransition();
        this.setPosition(0, 0, 0);
        this.resetFadeOut();
      }
    });

    this.destroyRef.onDestroy(() => {
      document.body.removeEventListener('mousemove', this.onMoveListener);
      document.body.removeEventListener('touchmove', this.onMoveListener);
      this.batchService.remove(this);
      if (this.fadeOutTimer) this.fadeOutTimer.clear();

      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
      }
    });
  }

  private onMouseMove(e: Event) {
    const x = (e as TouchEvent).touches ? (e as TouchEvent).changedTouches[0].pageX : (e as MouseEvent).pageX;
    const y = (e as TouchEvent).touches ? (e as TouchEvent).changedTouches[0].pageY : (e as MouseEvent).pageY;
    if (x === this._x && y === this._y) return;
    this._x = x;
    this._y = y;
    this._target = e.target as HTMLElement;
    if (!this.updateTimer) {
      this.updateTimer = setTimeout(() => {
        this.updateTimer = null;
        this.calcLocalCoordinate(this._x, this._y, this._target);
      }, this.delayMs);
    }
  }

  private calcLocalCoordinate(x: number, y: number, target: HTMLElement) {
    if (!target.closest('#app-table-layer')) return;

    const coordinate = this.tablePick.landingAt(x, y);

    callCursorMove([coordinate.x, coordinate.y, coordinate.z]);
  }

  private resetFadeOut() {
    this.opacityElement!.style.opacity = '1.0';
    if (this.fadeOutTimer == null) {
      this.fadeOutTimer = new ResettableTimeout(() => {
        this.opacityElement!.style.opacity = '0.0';
      }, FADE_OUT_AFTER_MS);
    }
    this.fadeOutTimer.reset();
  }

  private stopTransition() {
    this.cursorElement!.style.transform = window.getComputedStyle(this.cursorElement!).transform;
  }

  private setAnimatedTransition() {
    this.cursorElement!.style.transition = `transform ${this.delayMs + 33}ms linear, opacity 0.5s ease-out`;
  }

  private setPosition(x: number, y: number, z: number) {
    this.at = { x, y, z };
    this.layOnScreen();
  }

  /** Lays the cursor on the screen where the canvas draws the point of the floor it was last put at. */
  private layOnScreen() {
    const at = this.at;
    const layout = this.camera.layout;
    const onPage = at && layout ? this.surfaces.pageOf('floor', at.x, at.y, at.z) : null;
    if (!onPage || !layout) return;
    this.cursorElement!.style.transform = `translate(${onPage.x - layout.left}px, ${onPage.y - layout.top}px)`;
  }
}
