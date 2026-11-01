import { NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { VolumeType } from '@axe/core/storage/audio-output';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { observeSize } from '@axe/core/util/observe-size';
import { BattleSide, oppositeBattleSide } from '@axe/domain/battle/battle-lineup';
import { battleChangeLabel, BattleFighter, battleGaugeChanges } from '@axe/domain/battle/battle-scene';
import { DEFAULT_BATTLE_THEME } from '@axe/domain/battle/battle-settings';
import {
  BATTLE_STAGE_CANVAS,
  BATTLE_STAGE_SIZE_LABEL_KEYS,
  battleStageWindowBox,
  battleStageWindowPlace,
} from '@axe/domain/battle/battle-stage-window';
import {
  attackerStep,
  BATTLE_STILL_MS,
  BattleTimeline,
  battleTimeline,
  defeatProgress,
  drainProgress,
  fighterEntry,
  gaugeReadingAt,
  hitJolt,
  popState,
  progressBetween,
  stageOpenness,
} from '@axe/domain/battle/battle-timeline';
import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeColor, gaugeRatio, HIDDEN_GAUGE_NUMBERS } from '@axe/domain/character/piece-gauge';
import { EffectCast } from '@axe/domain/effect/effect-cast';
import { defeatPictureHeight, DefeatReaction, defeatReactionOf } from '@axe/domain/effect/effect-defeat';
import { effectParticlePlacements } from '@axe/domain/effect/effect-particle-placements';
import { EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  effectLandingTimes,
  EffectSpriteOptions,
  effectSprites,
  impactSoundTimes,
  launchSoundTimes,
  Point3,
} from '@axe/domain/effect/effect-timeline';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';
import {
  attackerPoint,
  bandHeight,
  BATTLE_CELL_PX,
  BATTLE_EFFECT_RISE_PX,
  BATTLE_FIGURE_PX,
  BATTLE_VIEW,
  defenderPoints,
  fighterShift,
  lyingTransform,
  stageScale,
  stageSpread,
  standingTransform,
} from '@axe/features/battle-cut-in/battle-stage-layout';
import { BATTLE_PICTURE_LOOK, BattleBandLook, battleThemeLook } from '@axe/features/battle-cut-in/battle-themes';
import { MirroredPictureService } from '@axe/features/battle-cut-in/mirrored-picture.service';
import { EffectCanvasComponent } from '@axe/features/effect/effect-canvas/effect-canvas.component';
import {
  EFFECT_CAMERA_LIFT_PX,
  effectBillboardTransform,
  effectCanvasStyle,
  effectPaintStyle,
  effectSpriteStyle,
  EffectViewpoint,
  hasEffectPaintLayer,
} from '@axe/features/effect/effect-sprite-style';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { Z_BATTLE_CUT_IN } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

const MAX_CANVASES = 8;
/** How long after the blow lands the struck stay lit by it. */
const HIT_FLASH_MS = 200;

const VIEWPOINT: EffectViewpoint = {
  rotation: BATTLE_VIEW,
  liftPx: EFFECT_CAMERA_LIFT_PX,
  risePx: BATTLE_EFFECT_RISE_PX,
  flatRisePx: 0,
};
/** The fallen go down where they stand, rather than raised to where a blow lands on them. */
const DEFEAT_VIEWPOINT: EffectViewpoint = { ...VIEWPOINT, risePx: 0 };

/** One effect playing on the stage, with how it is drawn. */
interface EffectLayer {
  preset: EffectPreset;
  cast: EffectCast;
  elapsed: number;
  options: EffectSpriteOptions;
  viewpoint: EffectViewpoint;
  prefix: string;
}

export interface SpriteFrame {
  key: string;
  style: Record<string, string>;
  /** The inner layer that carries the look and the animation, where the sprite has one. */
  paint: Record<string, string> | null;
  svg: string;
}

export interface CanvasFrame {
  key: string;
  layer: EffectParticleLayer;
  style: Record<string, string>;
}

/**
 * The stage's own paint, which nothing else in the room uses. Written here rather than as utility
 * classes, so that it is fetched with the stage instead of standing in the stylesheet every screen
 * downloads to open the room.
 */
const LOOKS = {
  vignette: 'linear-gradient(to bottom, rgb(0 0 0 / 0.2), transparent 35%, transparent 60%, rgb(0 0 0 / 0.6))',
  shadow: 'radial-gradient(closest-side, rgb(0 0 0 / 0.6), transparent)',
  figureShadow: 'drop-shadow(0 6px 6px rgb(0 0 0 / 0.6))',
  silhouette: {
    'border-radius': '35px 35px 0 0',
    background: 'linear-gradient(to bottom, rgb(30 30 40 / 0.95), rgb(10 10 16 / 0.95))',
    'box-shadow': '0 0 0 2px rgb(255 255 255 / 0.25)',
    color: 'white',
  },
  popShadow: '0 2px 0 rgb(0 0 0 / 0.9), 0 0 8px rgb(0 0 0 / 0.85)',
  hurt: '#ff5a4a',
  healed: '#6dffa0',
  banner: { 'font-size': 'clamp(28px, 7vw, 64px)', 'letter-spacing': '0.2em' },
  nameShadow: '0 1px 3px black',
  plateShadow: '0 4px 16px rgb(0 0 0 / 0.5)',
} as const;

/** One fighter on the stage: who it is, where it stands, and what it looks like. */
interface FighterView {
  key: string;
  fighter: BattleFighter;
  side: BattleSide;
  striking: boolean;
  point: Point3;
  imageUrl: string;
  /**
   * Whether its picture is turned left for right: a picture facing the side it stands on faces
   * away from the one across.
   */
  mirrored: boolean;
  /** Whether the reader may read its numbers, as for the bars over the piece. */
  readable: boolean;
  /** How its body answers going down, as a piece on the table does. */
  reaction: DefeatReaction;
}

export interface FigureFrame {
  key: string;
  imageUrl: string;
  /** Whether the picture is turned left for right. */
  mirrored: boolean;
  name: string;
  transform: string;
  shadowTransform: string;
  opacity: number;
  filter: string;
  /** How the body answers going down, once it has begun to. */
  reaction: DefeatReaction;
}

export interface PopFrame {
  key: string;
  transform: string;
  opacity: number;
  /** Whether it is told small, as what the one striking paid is. */
  small: boolean;
  lines: { text: string; hurt: boolean }[];
}

export interface PlateGauge {
  name: string;
  percent: number;
  color: string;
  numbers: string;
}

export interface PlateFrame {
  key: string;
  name: string;
  striking: boolean;
  defeated: boolean;
  gauges: PlateGauge[];
}

/**
 * The battle stage: a band across the screen where the one striking and those struck face each
 * other, the blow is drawn between them, the numbers jump out and the bars fall, and anybody
 * brought down goes down.
 *
 * Every screen works out each frame from the time since its own playing began, so nothing but
 * the scene is ever sent. The sounds of the effects play here, on this screen alone. Pressing
 * anywhere or Escape moves on. With motion turned off the stage shows one still of how the
 * exchange ended, and the sounds still play.
 *
 * A reader may have it drawn in a window instead, in a corner they drag it to: the stage is drawn
 * at a fixed size and shrunk to the window whole, and only its close button moves on, so that the
 * rest of the screen can be worked in, and its Escapes spent elsewhere, while the exchange plays.
 */
@Component({
  selector: 'battle-cut-in-overlay',
  templateUrl: './battle-cut-in-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgStyle, NgTemplateOutlet, SafePipe, EffectCanvasComponent, TranslocoModule],
  host: { class: 'contents', '(document:keydown.escape)': 'pressEscape()', '(window:resize)': 'measureScreen()' },
})
export class BattleCutInOverlayComponent {
  private readonly state = inject(BattleCutInStateService);
  private readonly motion = inject(MotionService);
  private readonly library = inject(EffectLibraryService);
  private readonly images = inject(ImageStorage);
  private readonly mirrors = inject(MirroredPictureService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly disclosure = inject(DisclosureService);
  private readonly preference = inject(BattleCutInPreferenceService);
  private readonly layout = inject(ViewportService);

  protected readonly zIndex = Z_BATTLE_CUT_IN;
  protected readonly looks = LOOKS;
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');
  private readonly viewport = signal({ width: 0, height: 0 });
  private readonly screen = signal(readScreen());
  private readonly dragPlace = signal<{ x: number; y: number } | null>(null);
  private dragFrom: { pointerX: number; pointerY: number; left: number; top: number } | null = null;

  protected readonly canvas = BATTLE_STAGE_CANVAS;
  /** How large this reader has the stage drawn. */
  readonly stageSize = computed(() => this.preference.stageWindow().size);
  protected readonly sizeLabelKey = computed(() => BATTLE_STAGE_SIZE_LABEL_KEYS[this.stageSize()]);
  /** Whether the screen is too narrow for a window to be moved about, which keeps it along the top. */
  protected readonly narrow = computed(() => this.layout.isCompact());
  /** The window the stage plays in, following the pointer while it is dragged; null on the full screen. */
  readonly windowBox = computed(() => {
    const place = this.preference.stageWindow();
    const dragged = this.dragPlace();
    return battleStageWindowBox(dragged ? { ...place, ...dragged } : place, this.screen(), this.narrow());
  });

  readonly scene = computed(() => this.state.current()?.scene ?? null);
  private readonly serial = computed(() => this.state.current()?.serial ?? 0);
  /** Whether the stage moves, as the room's effects do only while motion is on. */
  readonly still = computed(() => !this.motion.enabled());

  private readonly blow = computed(() => this.presetOf(this.scene()?.effect ?? ''));
  private readonly defeatEffect = computed(() => this.presetOf(this.scene()?.defeatEffect ?? ''));

  readonly timeline = computed<BattleTimeline | null>(() => {
    const scene = this.scene();
    if (!scene) return null;
    const blow = this.blow();
    const defeat = this.defeatEffect();
    const fallen = this.views().filter((view) => view.fighter.defeated).length;
    return battleTimeline({
      effectMs: blow ? blow.totalDuration(scene.defenders.length) : 0,
      landingMs: blow ? (effectLandingTimes(blow)[0] ?? blow.duration / 2) : 0,
      defeat: fallen > 0,
      defeatEffectMs: defeat && fallen > 0 ? defeat.totalDuration(fallen) : 0,
    });
  });

  /** How long the stage has been playing, in milliseconds, from nothing again for each scene. */
  private readonly clock = linkedSignal({ source: () => this.serial(), computation: () => 0 });

  /** The moment drawn: the clock, or the moment everything has happened while motion is off. */
  readonly elapsed = computed(() => {
    const timeline = this.timeline();
    if (!timeline) return 0;
    return this.still() ? timeline.outroStart - 1 : this.clock();
  });

  /** The fighters as they stand, each picture taking the silhouette's place as soon as it arrives. */
  readonly views = computed<FighterView[]>(() => {
    const scene = this.scene();
    if (!scene) return [];
    this.objectChange.fileVersion();
    const across = oppositeBattleSide(scene.attackerSide);
    const spread = stageSpread(this.viewport().width, this.bandHeight());
    const points = defenderPoints(scene.attackerSide, scene.defenders.length, spread);
    const reaction = this.still() ? '' : defeatReactionOf(this.defeatEffect()?.effectKind ?? 'burst');
    return [
      this.viewOf(scene.attacker, scene.attackerSide, true, attackerPoint(scene.attackerSide, spread), reaction),
      ...scene.defenders.map((defender, index) => this.viewOf(defender, across, false, points[index], reaction)),
    ];
  });

  readonly openness = computed(() => {
    const timeline = this.timeline();
    return timeline ? stageOpenness(this.elapsed(), timeline) : 0;
  });

  readonly bandHeight = computed(() =>
    this.windowBox() ? BATTLE_STAGE_CANVAS.height : bandHeight(this.viewport().height)
  );

  readonly boardTransform = computed(() => {
    const scale = stageScale(this.viewport().width, this.bandHeight(), this.scene()?.defenders.length ?? 1);
    return `scale3d(${scale}, ${scale}, ${scale}) rotateX(${BATTLE_VIEW.x}deg)`;
  });

  /** Which of the tool's own stages is drawn where the room's own picture is not. */
  readonly theme = computed(() => this.scene()?.theme ?? DEFAULT_BATTLE_THEME);
  readonly themeLook = computed(() => battleThemeLook(this.theme()));

  readonly backgroundUrl = computed(() => {
    this.objectChange.fileVersion();
    const identifier = this.scene()?.background ?? '';
    return identifier.length > 0 ? (this.images.get(identifier)?.url ?? '') : '';
  });

  /** How the band and the plates look: plain on the room's own picture, else as the stage has them. */
  readonly bandLook = computed<BattleBandLook>(() => (this.backgroundUrl() ? BATTLE_PICTURE_LOOK : this.themeLook()));
  readonly bannerStyle = computed(() => ({ ...LOOKS.banner, ...this.bandLook().banner }));
  readonly plateStyles = computed(() => {
    const look = this.bandLook();
    return {
      left: { 'border-left': `4px solid ${look.left}`, 'box-shadow': LOOKS.plateShadow },
      right: { 'border-right': `4px solid ${look.right}`, 'box-shadow': LOOKS.plateShadow },
    };
  });

  /** The picture behind the stage: the room's own, else the stage's. */
  readonly pictureUrl = computed(() => this.backgroundUrl() || this.themeLook().image);
  /** The part of the stage's picture kept where the band cuts it; the room's own is kept to its middle. */
  readonly pictureFocus = computed(() => (this.backgroundUrl() ? null : this.themeLook().focus));

  readonly figures = computed<FigureFrame[]>(() => {
    const timeline = this.timeline();
    if (!timeline) return [];
    const elapsed = this.elapsed();
    const entry = fighterEntry(elapsed);
    const step = attackerStep(elapsed, timeline);
    const flash =
      elapsed >= timeline.impact ? 1 - progressBetween(elapsed, timeline.impact, timeline.impact + HIT_FLASH_MS) : 0;
    const jolt = hitJolt(elapsed, timeline) * BATTLE_CELL_PX;
    const down = defeatProgress(elapsed, timeline);

    return this.views().map((view) => {
      const struck = !view.striking;
      const shift = fighterShift(view.side, entry, view.striking ? step : 0) + (struck ? jolt : 0);
      const fallen = view.fighter.defeated ? down : 0;
      const reaction = fallen > 0 ? view.reaction : '';
      const filters: string[] = [];
      if (struck && flash > 0) filters.push(`brightness(${(1 + 1.6 * flash).toFixed(3)})`);
      if (fallen > 0) filters.push(`grayscale(${fallen.toFixed(3)})`);
      return {
        key: view.key,
        imageUrl: view.imageUrl,
        mirrored: view.mirrored,
        name: view.fighter.name,
        transform: standingTransform(view.point, shift, 0),
        shadowTransform: lyingTransform(view.point, shift),
        opacity: this.bodyOpacity(fallen, reaction),
        filter: filters.join(' '),
        reaction,
      };
    });
  });

  readonly pops = computed<PopFrame[]>(() => {
    const timeline = this.timeline();
    const scene = this.scene();
    if (!timeline || !scene || scene.secret) return [];
    const elapsed = this.elapsed();
    const entry = fighterEntry(elapsed);
    const step = attackerStep(elapsed, timeline);
    return this.views().flatMap((view) => {
      const changes = battleGaugeChanges(view.fighter);
      if (changes.length < 1) return [];
      const pop = this.still() ? { scale: 1, rise: 0, opacity: 1 } : popState(elapsed, beatsOf(view, timeline));
      if (pop.opacity <= 0) return [];
      const lift = BATTLE_FIGURE_PX + 8 + pop.rise * BATTLE_CELL_PX;
      const shift = fighterShift(view.side, entry, view.striking ? step : 0);
      // A lone number over the struck is plainly what the blow did; what the one striking paid,
      // or more than one number, is told by name.
      const named = view.striking || changes.length > 1;
      return [
        {
          key: view.key,
          transform: standingTransform(view.point, shift, lift, pop.scale),
          opacity: pop.opacity,
          small: view.striking,
          lines: changes.map((change) => ({
            text: named ? `${change.name} ${battleChangeLabel(change.delta)}` : battleChangeLabel(change.delta),
            hurt: change.hurt,
          })),
        },
      ];
    });
  });

  readonly plates = computed<{ left: PlateFrame[]; right: PlateFrame[] }>(() => {
    const timeline = this.timeline();
    const scene = this.scene();
    if (!timeline || !scene) return { left: [], right: [] };
    const elapsed = this.elapsed();
    const left: PlateFrame[] = [];
    const right: PlateFrame[] = [];
    for (const view of this.views()) {
      const progress = drainProgress(elapsed, beatsOf(view, timeline));
      const readable = view.readable && !scene.secret;
      const plate: PlateFrame = {
        key: view.key,
        name: view.fighter.name,
        striking: view.striking,
        defeated: view.fighter.defeated && defeatProgress(elapsed, timeline) > 0,
        gauges: view.fighter.gauges.map((gauge) => {
          const reading = gaugeReadingAt(gauge.before, gauge.after, progress);
          const ratio = gaugeRatio(reading, gauge.max);
          return {
            name: gauge.name,
            percent: ratio * 100,
            color: gauge.color || gaugeColor(ratio, gauge.inverted),
            numbers: readable ? `${Math.round(reading)}/${gauge.max}` : HIDDEN_GAUGE_NUMBERS,
          };
        }),
      };
      (view.side === 'left' ? left : right).push(plate);
    }
    return { left, right };
  });

  /** The names of those brought down, once they have begun to go down. */
  readonly fallenNames = computed<string[]>(() => {
    const timeline = this.timeline();
    if (!timeline || defeatProgress(this.elapsed(), timeline) <= 0) return [];
    return this.views()
      .filter((view) => view.fighter.defeated)
      .map((view) => view.fighter.name);
  });

  /** How far the banner for those brought down has come in, from 0 to 1. */
  readonly bannerIn = computed(() => {
    const timeline = this.timeline();
    if (!timeline || timeline.defeatStart < 0) return 0;
    if (this.still()) return 1;
    return progressBetween(this.elapsed(), timeline.defeatStart + 120, timeline.defeatStart + 420);
  });

  /** The streak of light that sweeps the stage as it opens, from 0 to 1 across. */
  readonly sweep = computed(() => (this.still() ? 1 : progressBetween(this.elapsed(), 120, 620)));

  private readonly spriteOptions = computed<EffectSpriteOptions>(() => {
    const views = this.views();
    return {
      baseSize: BATTLE_CELL_PX,
      viewRotation: BATTLE_VIEW,
      resolvePosition: (identifier) => views.find((view) => view.fighter.identifier === identifier)?.point ?? null,
      resolveImage: (identifier) => {
        const view = views.find((held) => held.fighter.identifier === identifier);
        if (!view) return '';
        return view.mirrored ? this.mirrors.of(view.imageUrl) || view.imageUrl : view.imageUrl;
      },
    };
  });

  private readonly blowCast = computed<EffectCast | null>(() => {
    const scene = this.scene();
    const blow = this.blow();
    if (!scene || !blow) return null;
    const [attacker, ...struck] = this.views();
    return {
      presetIdentifier: blow.identifier,
      casterIdentifier: attacker.fighter.identifier,
      origin: { ...attacker.point, x: attacker.point.x + fighterShift(attacker.side, 1, 1) },
      targets: struck.map((view) => ({ identifier: view.fighter.identifier, ...view.point })),
      seed: scene.seed,
    };
  });

  private readonly defeatCast = computed<EffectCast | null>(() => {
    const scene = this.scene();
    const defeat = this.defeatEffect();
    const fallen = this.views().filter((view) => view.fighter.defeated);
    if (!scene || !defeat || fallen.length < 1) return null;
    return {
      presetIdentifier: defeat.identifier,
      casterIdentifier: '',
      origin: null,
      targets: fallen.map((view) => ({ identifier: view.fighter.identifier, ...view.point })),
      seed: scene.seed + 1,
    };
  });

  /** The effects playing at this moment: the blow, and the going down of the fallen. */
  private readonly layers = computed<EffectLayer[]>(() => {
    const timeline = this.timeline();
    if (!timeline || this.still()) return [];
    const elapsed = this.elapsed();
    const serial = this.serial();
    const options = this.spriteOptions();
    const layers: EffectLayer[] = [];

    const blow = this.blow();
    const blowCast = this.blowCast();
    if (blow && blowCast) {
      layers.push({
        preset: blow,
        cast: blowCast,
        elapsed: elapsed - timeline.effectStart,
        options,
        viewpoint: VIEWPOINT,
        prefix: `${serial}-b`,
      });
    }

    const defeat = this.defeatEffect();
    const defeatCast = this.defeatCast();
    if (defeat && defeatCast) {
      // The picture of the fallen is drawn the height they stand, rather than the height of a cell.
      const picture = defeatPictureHeight(defeat.effectKind) * defeat.sizeScale;
      layers.push({
        preset: defeat,
        cast: defeatCast,
        elapsed: elapsed - timeline.defeatStart,
        options: { ...options, baseSize: BATTLE_FIGURE_PX / picture },
        viewpoint: DEFEAT_VIEWPOINT,
        prefix: `${serial}-d`,
      });
    }
    return layers.filter(
      (layer) => layer.elapsed >= 0 && layer.elapsed <= layer.preset.totalDuration(layer.cast.targets.length)
    );
  });

  readonly sprites = computed<SpriteFrame[]>(() =>
    this.layers().flatMap((layer) =>
      effectSprites(layer.preset, layer.cast, layer.elapsed, layer.options).map((sprite) => ({
        key: `${layer.prefix}-${sprite.key}`,
        style: effectSpriteStyle(sprite, layer.viewpoint),
        paint: hasEffectPaintLayer(sprite) ? effectPaintStyle(sprite) : null,
        svg: sprite.svg,
      }))
    )
  );

  readonly canvases = computed<CanvasFrame[]>(() =>
    this.layers().flatMap((layer) =>
      effectParticlePlacements(layer.preset, layer.cast, layer.elapsed, layer.options, MAX_CANVASES).map(
        (placement) => ({
          key: `${layer.prefix}-${placement.key}`,
          layer: placement.layer,
          style: effectCanvasStyle({
            key: placement.key,
            layer: placement.layer,
            width: placement.layer.width,
            height: placement.layer.height,
            transform: effectBillboardTransform(placement.center, placement.layer, layer.viewpoint),
          }),
        })
      )
    )
  );

  constructor() {
    effect((onCleanup) => {
      const root = this.root()?.nativeElement;
      if (!root) return;
      onCleanup(observeSize(root, (size) => this.viewport.set(size)));
    });

    effect((onCleanup) => {
      if (this.serial() === 0) return;
      const timeline = untracked(this.timeline);
      if (!timeline) return;
      const timers = this.scheduleSounds(timeline);
      onCleanup(() => timers.forEach((timer) => clearTimeout(timer)));

      if (this.still() || typeof requestAnimationFrame !== 'function') {
        const timer = setTimeout(() => this.state.next(), BATTLE_STILL_MS);
        onCleanup(() => clearTimeout(timer));
        return;
      }
      const startedAt = performance.now();
      let handle = 0;
      const tick = (now: number) => {
        const elapsed = now - startedAt;
        this.clock.set(elapsed);
        if (elapsed >= timeline.end) {
          this.state.next();
          return;
        }
        handle = requestAnimationFrame(tick);
      };
      handle = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(handle));
    });
  }

  /** Moves on to the next scene, or closes the stage. */
  skip(): void {
    if (this.state.active()) this.state.next();
  }

  /** A press on the stage moves on over the full screen; a window is only closed by its button. */
  pressStage(): void {
    if (!this.windowBox()) this.skip();
  }

  /** Escape moves on over the full screen, and is left to whatever else wants it beside a window. */
  pressEscape(): void {
    if (!this.windowBox()) this.skip();
  }

  /** Moves the stage on to its next size, from the full screen down to the smallest window and round. */
  cycleSize(): void {
    this.preference.cycleStageSize();
  }

  /** Takes in the size of the screen again, for a window to keep to its corner. */
  measureScreen(): void {
    this.screen.set(readScreen());
  }

  /** Takes hold of the window by its top edge, where the screen is wide enough to move it about. */
  startDrag(event: PointerEvent): void {
    const box = this.windowBox();
    if (!box || this.narrow() || event.button !== 0) return;
    (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    this.dragFrom = { pointerX: event.clientX, pointerY: event.clientY, left: box.left, top: box.top };
  }

  /** Follows the pointer with the window held. */
  moveDrag(event: PointerEvent): void {
    const from = this.dragFrom;
    const box = this.windowBox();
    if (!from || !box) return;
    const left = from.left + event.clientX - from.pointerX;
    const top = from.top + event.clientY - from.pointerY;
    this.dragPlace.set(battleStageWindowPlace(left, top, box, this.screen()));
  }

  /** Lets go of the window, and keeps it where it was put. */
  endDrag(): void {
    if (!this.dragFrom) return;
    this.dragFrom = null;
    const place = this.dragPlace();
    this.dragPlace.set(null);
    if (place) this.preference.placeStageWindow(place.x, place.y);
  }

  /**
   * How solid a fighter's body stands as it goes down. Crumbling and cleaving take it away
   * themselves as the pieces of the picture take over; a fighter that only bleeds fades most of the
   * way; one with no effect to go down with fades out. The still leaves the fallen faintly there.
   */
  private bodyOpacity(fallen: number, reaction: DefeatReaction): number {
    if (fallen <= 0) return 1;
    if (this.still()) return 0.35;
    if (reaction === 'dissolve' || reaction === 'bisect') return 1;
    return 1 - fallen * (reaction === 'flinch' ? 0.65 : 1);
  }

  protected readonly figureHeight = BATTLE_FIGURE_PX;
  protected readonly shadowWidth = BATTLE_CELL_PX * 1.6;

  /**
   * Sounds the scene on this screen: a rush of air as the stage opens, the blow's own sounds where
   * they fall, and the sounds of going down. With motion off only the landing and the going down
   * sound, at once, with the still.
   */
  private scheduleSounds(timeline: BattleTimeline): ReturnType<typeof setTimeout>[] {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (delay: number, identifier: string) => {
      if (identifier.length < 1) return;
      timers.push(setTimeout(() => SoundEffect.playLocal(identifier, VolumeType.EFFECT), Math.max(0, delay)));
    };
    const blow = untracked(this.blow);
    const defeat = untracked(this.defeatEffect);
    const someoneFalls = timeline.defeatStart >= 0;

    if (this.still()) {
      if (blow) at(0, blow.impactSoundIdentifier || blow.soundIdentifier);
      if (defeat && someoneFalls) at(0, defeat.soundIdentifier);
      return timers;
    }

    at(0, PresetSound.windSmall);
    if (blow) {
      for (const delay of launchSoundTimes(blow)) at(timeline.effectStart + delay, blow.soundIdentifier);
      for (const delay of impactSoundTimes(blow)) at(timeline.effectStart + delay, blow.impactSoundIdentifier);
    } else {
      at(timeline.impact, PresetSound.bashSmall);
    }
    if (defeat && someoneFalls) {
      for (const delay of launchSoundTimes(defeat)) at(timeline.defeatStart + delay, defeat.soundIdentifier);
      for (const delay of impactSoundTimes(defeat)) at(timeline.defeatStart + delay, defeat.impactSoundIdentifier);
    }
    return timers;
  }

  private viewOf(
    fighter: BattleFighter,
    side: BattleSide,
    striking: boolean,
    point: Point3,
    reaction: DefeatReaction
  ): FighterView {
    const image = fighter.image.length > 0 ? this.images.get(fighter.image) : null;
    const imageUrl = image?.url ?? '';
    const mirrored = fighter.facing === side;
    if (mirrored && imageUrl.length > 0) this.mirrors.of(imageUrl);
    return {
      key: `${striking ? 'a' : 'd'}-${fighter.identifier}`,
      fighter,
      side,
      striking,
      point,
      imageUrl,
      mirrored,
      readable: this.readable(fighter.identifier),
      reaction,
    };
  }

  /** Whether the reader may read a piece's numbers; one no longer in the room keeps nothing back. */
  private readable(identifier: string): boolean {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    if (!(piece instanceof GameCharacter)) return true;
    this.objectChange.versionOf(identifier)();
    this.objectChange.trackMyCursor();
    return this.disclosure.canView(piece);
  }

  private presetOf(identifier: string): EffectPreset | null {
    return identifier.length > 0 ? this.library.get(identifier) : null;
  }
}

/** The size of the screen the stage is drawn on, nothing where there is no window to measure. */
function readScreen(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The beats a fighter's numbers keep: the one striking pays as the blow sets off, and the struck
 * are hurt as it lands.
 */
function beatsOf(view: FighterView, timeline: BattleTimeline): BattleTimeline {
  if (!view.striking) return timeline;
  const early = timeline.impact - timeline.effectStart;
  return { ...timeline, impact: timeline.effectStart, drainEnd: timeline.drainEnd - early };
}
