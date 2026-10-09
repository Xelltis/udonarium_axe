import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { stampLabelKey, StampMotion, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';
import { motifStampSvg, sealStampSvg } from '@axe/domain/chat/stamp-glyphs';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** The classes that move a stamp once, written out whole so the rules for stopped motion find them. */
const MOTION_CLASSES: Readonly<Record<StampMotion, string>> = {
  pop: 'animate-stamp-pop',
  shiver: 'animate-stamp-shiver',
  slam: 'animate-stamp-slam',
  beat: 'animate-stamp-beat',
  press: 'animate-stamp-press',
  spin: 'animate-stamp-spin',
};

/** The white edge and the drop the words of a sound effect are written with, as in a comic. */
const SOUND_EFFECT_EDGE = [
  '0.07em 0 0 #fff',
  '-0.07em 0 0 #fff',
  '0 0.07em 0 #fff',
  '0 -0.07em 0 #fff',
  '0.05em 0.05em 0 #fff',
  '-0.05em 0.05em 0 #fff',
  '0.05em -0.05em 0 #fff',
  '-0.05em -0.05em 0 #fff',
  '0.09em 0.11em 0 rgba(0, 0, 0, 0.35)',
].join(', ');

type StampView =
  | {
      readonly kind: 'words';
      readonly name: string;
      readonly words: string;
      readonly color: string;
      readonly tilt: number;
      readonly fontSizePx: number;
      readonly motion: StampMotion;
    }
  | {
      readonly kind: 'picture';
      readonly name: string;
      readonly svg: string;
      readonly tilt: number;
      readonly motion: StampMotion;
    }
  | { readonly kind: 'image'; readonly name: string; readonly url: string; readonly motion: StampMotion };

/**
 * One stamp, drawn at the size asked for.
 *
 * A sound effect is written in heavy leaning letters with a white edge; a seal and a table mark are
 * pictures; a stamp from a room's set is its picture. A stamp this version does not know, or one
 * whose picture is not here, draws nothing at all. Each time `play` is given a new number above 0
 * the stamp makes its move once.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ui-stamp',
  templateUrl: './stamp.component.html',
  host: { class: 'inline-flex shrink-0' },
  imports: [SafePipe],
})
export class StampComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly packs = inject(StampPackService);

  /** The stamp, by the identifier it is kept under. */
  readonly stampId = input.required<string>();
  /** The width and height of the box it is drawn in, in pixels. */
  readonly size = input(48);
  /** A number to bump, above 0, for the stamp to make its move again. */
  readonly play = input(0);

  protected readonly view = computed<StampView | null>(() => {
    const ref = stampOf(this.stampId());
    if (!ref) return null;
    if (ref.kind === 'image') {
      this.objectChange.fileVersion();
      const image = ImageStorage.instance.get(ref.imageIdentifier);
      if (!image?.url) return null;
      const name = this.packs.nameOf(ref.imageIdentifier) || image.name;
      return { kind: 'image', name, url: image.url, motion: 'pop' };
    }
    this.language.currentLang();
    const { stamp } = ref;
    const name = this.t(stampNameKey(stamp));
    if (stamp.family === 'motif') {
      return {
        kind: 'picture',
        name,
        svg: motifStampSvg(stamp.key, stamp.color),
        tilt: stamp.tilt,
        motion: stamp.motion,
      };
    }
    const words = this.t(stampLabelKey(stamp));
    if (stamp.family === 'seal') {
      return { kind: 'picture', name, svg: sealStampSvg(words, stamp.color), tilt: stamp.tilt, motion: stamp.motion };
    }
    const length = Math.max(2, Array.from(words).length);
    const fontSizePx = Math.round(this.size() * Math.max(0.24, Math.min(0.6, 1.25 / length)));
    return { kind: 'words', name, words, color: stamp.color, tilt: stamp.tilt, fontSizePx, motion: stamp.motion };
  });

  protected readonly edge = SOUND_EFFECT_EDGE;

  /** The class that makes the stamp's move, for a play number above 0. */
  protected motionClass(view: StampView, play: number): string | null {
    return play > 0 ? MOTION_CLASSES[view.motion] : null;
  }
}
