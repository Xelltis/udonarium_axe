import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { stampArtUrl, stampLabelKey, StampMotion, stampNameKey, stampOf } from '@axe/domain/chat/stamp-catalog';
import { SEAL_FILTER_ID, sealStampSvg } from '@axe/domain/chat/stamp-glyphs';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** How many stamps have been made, for each to give its seal's filter an id of its own. */
let stampsMade = 0;

/** The ink the name of a picture from the room is written in while the picture is not here. */
const MISSING_PICTURE_INK = '#8a8f99';

/** The classes that move a stamp once, written out whole so the rules for stopped motion find them. */
const MOTION_CLASSES: Readonly<Record<StampMotion, string>> = {
  pop: 'animate-stamp-pop',
  shiver: 'animate-stamp-shiver',
  slam: 'animate-stamp-slam',
  beat: 'animate-stamp-beat',
  press: 'animate-stamp-press',
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
 * A sound effect is written in heavy leaning letters with a white edge; a seal is drawn; the
 * character's stamps and a stamp from a room's set are their pictures; while the picture of a
 * stamp from the room is not here, its name is written in its place. A stamp this version does not
 * know draws nothing at all. Each time `play` is given a new number above 0 the stamp makes its move
 * once.
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

  /**
   * The id this stamp's seal gives its filter, its own, so no seal leans on another's: one on a page
   * not drawn, in a closed list, would take the ink off every seal that pointed at it.
   */
  private readonly sealFilterId = `${SEAL_FILTER_ID}-${++stampsMade}`;

  protected readonly view = computed<StampView | null>(() => {
    const ref = stampOf(this.stampId());
    if (!ref) return null;
    if (ref.kind === 'image') {
      this.objectChange.fileVersion();
      const image = ImageStorage.instance.get(ref.imageIdentifier);
      if (!image?.url) {
        this.language.currentLang();
        const name = this.packs.nameOf(ref.imageIdentifier) || this.t('ui.stamp.picture');
        const words = this.t('ui.stamp.standIn', { words: name });
        return {
          kind: 'words',
          name,
          words,
          color: MISSING_PICTURE_INK,
          tilt: 0,
          fontSizePx: this.wordsSize(words),
          motion: 'pop',
        };
      }
      const name = this.packs.nameOf(ref.imageIdentifier) || image.name;
      return { kind: 'image', name, url: image.url, motion: 'pop' };
    }
    this.language.currentLang();
    const { stamp } = ref;
    const name = this.t(stampNameKey(stamp));
    const art = stampArtUrl(stamp);
    if (art) return { kind: 'image', name, url: art, motion: stamp.motion };
    const words = this.t(stampLabelKey(stamp));
    if (stamp.family === 'seal') {
      const svg = sealStampSvg(words, stamp.color).replaceAll(SEAL_FILTER_ID, this.sealFilterId);
      return { kind: 'picture', name, svg, tilt: stamp.tilt, motion: stamp.motion };
    }
    return {
      kind: 'words',
      name,
      words,
      color: stamp.color,
      tilt: stamp.tilt,
      fontSizePx: this.wordsSize(words),
      motion: stamp.motion,
    };
  });

  /** How large words are written for the box: smaller the more there are, within bounds. */
  private wordsSize(words: string): number {
    const length = Math.max(2, Array.from(words).length);
    return Math.round(this.size() * Math.max(0.24, Math.min(0.6, 1.25 / length)));
  }

  protected readonly edge = SOUND_EFFECT_EDGE;

  /** The class that makes the stamp's move, for a play number above 0. */
  protected motionClass(view: StampView, play: number): string | null {
    return play > 0 ? MOTION_CLASSES[view.motion] : null;
  }
}
