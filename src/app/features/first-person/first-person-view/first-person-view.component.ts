import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { depthOf, eyeFrameOf } from '@axe/domain/tabletop/first-person/first-person-clip';
import { FirstPersonMove, FirstPersonPose } from '@axe/domain/tabletop/first-person/first-person-lattice';
import {
  FIRST_PERSON_FOV_DEG,
  FirstPersonQuad,
  firstPersonScene,
} from '@axe/domain/tabletop/first-person/first-person-scene';
import { cellIndexAt, CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { lightSourcesOn } from '@axe/domain/tabletop/table-lights';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { facingNameOf, isHexLattice, padRows } from '@axe/features/first-person/first-person-hud';
import { FirstPersonCommand, firstPersonKeyDown } from '@axe/features/first-person/first-person-keys';
import {
  billboardStyle,
  cameraTransform,
  perspectivePx,
  planeQuadStyle,
  QuadStyle,
  scaleOf,
  shadeFor,
  wallQuadStyle,
} from '@axe/features/first-person/first-person-style';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { TranslocoModule } from '@jsverse/transloco';

const NEAR_CELLS = 0.05;
const GLIDE_MS = 160;
const SNAP_CELLS = 3;
const SNAP_TURN_DEG = 135;

interface QuadView {
  id: string;
  kind: FirstPersonQuad['kind'];
  tone: string;
  style: QuadStyle;
}

interface PieceView {
  id: string;
  name: string;
  url: string;
  style: QuadStyle;
}

interface GlowView {
  id: string;
  style: QuadStyle;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'first-person-view',
  templateUrl: './first-person-view.component.html',
  host: {
    class: 'absolute inset-0 block select-none overflow-hidden bg-black',
    '(document:keydown)': 'onKeydown($event)',
  },
  imports: [TranslocoModule],
})
export class FirstPersonViewComponent {
  protected readonly firstPerson = inject(FirstPersonService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly vision = inject(VisionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly motion = inject(MotionService);
  private readonly modal = inject(ModalService);
  private readonly movePlan = inject(MovePlanService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly width = signal(0);
  private readonly shown = signal<FirstPersonPose | null>(null);
  private frame: number | null = null;

  constructor() {
    effect(() => {
      const target = this.firstPerson.pose();
      untracked(() => this.glideTo(target));
    });
    this.watchWidth();
    this.destroyRef.onDestroy(() => this.stopGlide());
  }

  private readonly gridSize = computed(() => this.firstPerson.table()?.gridSize ?? 0);

  private readonly scale = computed(() => scaleOf(this.gridSize()));

  protected readonly perspective = computed(() => perspectivePx(this.width() || 1280, FIRST_PERSON_FOV_DEG));

  protected readonly camera = computed(() => {
    const pose = this.shown();
    return pose ? cameraTransform(pose, this.scale(), this.perspective()) : 'none';
  });

  private readonly quads = computed<FirstPersonQuad[]>(() => {
    const pose = this.shown();
    const world = this.firstPerson.world();
    const grid = this.firstPerson.grid();
    if (!pose || !world || !grid) return [];
    return firstPersonScene({
      world,
      grid,
      pose,
      seen: this.firstPerson.seen(),
      depthPx: this.firstPerson.depthPx(),
      nearPx: NEAR_CELLS * this.gridSize(),
    });
  });

  protected readonly quadViews = computed<QuadView[]>(() => {
    this.objectChange.fileVersion();
    const scale = this.scale();
    const depth = this.firstPerson.depthPx();
    return this.quads().map((quad) => {
      const url = this.urlOf(quad.image);
      const shade = shadeFor(quad.depth, depth);
      const style =
        quad.kind === 'wall' ? wallQuadStyle(quad, scale, url, shade) : planeQuadStyle(quad, scale, url, shade);
      return { id: quad.id, kind: quad.kind, tone: toneOf(quad), style };
    });
  });

  protected readonly pieceViews = computed<PieceView[]>(() => {
    const pose = this.shown();
    const viewer = this.firstPerson.piece();
    const gridSize = this.gridSize();
    if (!pose || !viewer || gridSize <= 0) return [];
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.fileVersion();
    const views: PieceView[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (piece.identifier === viewer.identifier) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (!piece.isVisibleOnTable || surfaceOf(piece) !== 'floor') continue;
      if (!this.disclosure.canView(piece) || !this.vision.isTokenVisible(piece)) continue;
      const size = Math.max(1, piece.size) * gridSize;
      const centre = { x: piece.location.x + size / 2, y: piece.location.y + size / 2 };
      if (!this.inSight(pose, centre)) continue;
      views.push({
        id: piece.identifier,
        name: piece.name,
        url: piece.imageFile.url,
        style: billboardStyle(
          { ...centre, z: piece.posZ + piece.altitude * gridSize },
          size * 0.9,
          size * 1.5,
          pose.yaw,
          this.scale()
        ),
      });
    }
    return views;
  });

  protected readonly glowViews = computed<GlowView[]>(() => {
    const pose = this.shown();
    const table = this.firstPerson.table();
    const gridSize = this.gridSize();
    if (!pose || !table || gridSize <= 0) return [];
    const views: GlowView[] = [];
    for (const light of lightSourcesOn(table)) {
      this.objectChange.versionOf(light.identifier)();
      if (!light.isVisibleOnTable || surfaceOf(light) !== 'floor') continue;
      if (this.vision.isPieceHiddenByFog(light)) continue;
      const centre = { x: light.location.x + gridSize / 2, y: light.location.y + gridSize / 2 };
      if (!this.inSight(pose, centre)) continue;
      views.push({
        id: light.identifier,
        style: billboardStyle(
          { ...centre, z: light.posZ + gridSize * 0.4 },
          gridSize * 0.7,
          gridSize * 0.7,
          pose.yaw,
          this.scale()
        ),
      });
    }
    return views;
  });

  protected readonly pieceName = computed(() => this.firstPerson.piece()?.name ?? '');

  protected readonly facing = computed(() => facingNameOf(this.firstPerson.pose()?.yaw ?? 0));

  protected readonly padRows = computed(() => padRows(this.firstPerson.lattice()));

  protected readonly isHex = computed(() => isHexLattice(this.firstPerson.lattice()));

  onKeydown(event: KeyboardEvent): void {
    const command = firstPersonKeyDown(event.code, {
      typing: isTypingTarget(event.target),
      composing: event.isComposing,
      chord: event.ctrlKey || event.metaKey || event.altKey,
      busy: this.modal.isShow || this.visualNovel.active() || this.movePlan.isPlanning(),
      forced: this.firstPerson.forced(),
      lattice: this.firstPerson.lattice(),
    });
    if (!command) return;
    event.preventDefault();
    this.run(command);
  }

  protected move(move: FirstPersonMove): void {
    void this.firstPerson.walk(move);
  }

  protected turn(turn: 1 | -1): void {
    void this.firstPerson.turn(turn);
  }

  protected door(): void {
    this.firstPerson.toggleDoorAhead();
  }

  protected exit(): void {
    this.firstPerson.exitSeat();
  }

  private run(command: FirstPersonCommand): void {
    switch (command.kind) {
      case 'move':
        this.move(command.move);
        return;
      case 'turn':
        this.turn(command.turn);
        return;
      case 'door':
        this.door();
        return;
      case 'exit':
        this.exit();
        return;
    }
  }

  private inSight(pose: FirstPersonPose, centre: CellPoint): boolean {
    const grid = this.firstPerson.grid();
    const seen = this.firstPerson.seen();
    if (!grid) return false;
    const cell = cellIndexAt(grid, centre.x, centre.y);
    if (seen && (cell < 0 || !seen.get(cell))) return false;
    const depth = depthOf(eyeFrameOf(pose), centre);
    return depth > this.gridSize() * NEAR_CELLS * 4 && depth <= this.firstPerson.depthPx();
  }

  private urlOf(identifier: string): string {
    if (!identifier || identifier === 'imageIdentifier') return '';
    const image = this.imageService.getEmptyOr(identifier);
    return image.isEmpty ? '' : image.url;
  }

  private glideTo(target: FirstPersonPose | null): void {
    this.stopGlide();
    const from = this.shown();
    if (!target || !from || !this.motion.enabled() || this.tooFar(from, target)) {
      this.shown.set(target);
      return;
    }
    const turn = ((((target.yaw - from.yaw) % 360) + 540) % 360) - 180;
    const started = performance.now();
    const step = (now: number): void => {
      const along = Math.min(1, (now - started) / GLIDE_MS);
      const eased = along * (2 - along);
      if (along >= 1) {
        this.frame = null;
        this.shown.set(target);
        return;
      }
      this.shown.set({
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        z: from.z + (target.z - from.z) * eased,
        yaw: from.yaw + turn * eased,
      });
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private tooFar(from: FirstPersonPose, to: FirstPersonPose): boolean {
    const turn = Math.abs(((((to.yaw - from.yaw) % 360) + 540) % 360) - 180);
    return Math.hypot(to.x - from.x, to.y - from.y) > SNAP_CELLS * this.gridSize() || turn > SNAP_TURN_DEG;
  }

  private stopGlide(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private watchWidth(): void {
    const element = this.host.nativeElement;
    this.width.set(element.clientWidth || window.innerWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.width.set(element.clientWidth || window.innerWidth));
    observer.observe(element);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}

function toneOf(quad: FirstPersonQuad): string {
  if (quad.kind === 'wall') {
    if (quad.glass) return 'bg-sky-200/25';
    return quad.door ? 'bg-amber-900' : 'bg-stone-600';
  }
  if (quad.kind === 'floor') return 'bg-stone-800';
  if (quad.kind === 'ceiling') return 'bg-stone-950';
  return quad.glass ? 'bg-sky-200/20' : 'bg-stone-500';
}
