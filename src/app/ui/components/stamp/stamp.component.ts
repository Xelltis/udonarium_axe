import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StampMotion } from '@axe/domain/chat/stamp-catalog';
import { SEAL_FILTER_ID } from '@axe/domain/chat/stamp-glyphs';
import {
  roomStampViewSource,
  SOUND_EFFECT_EDGE,
  StampView,
  stampViewOf,
  stampWordsSize,
} from '@axe/ui/components/stamp/stamp-view';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/** How many stamps have been made, for each to give its seal's filter an id of its own. */
let stampsMade = 0;

/** The classes that move a stamp once, written out whole so the rules for stopped motion find them. */
const MOTION_CLASSES: Readonly<Record<StampMotion, string>> = {
  pop: 'animate-stamp-pop',
  shiver: 'animate-stamp-shiver',
  slam: 'animate-stamp-slam',
  beat: 'animate-stamp-beat',
  press: 'animate-stamp-press',
};

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
  host: { class: 'inline-flex shrink-0', '[attr.title]': 'hoverName()' },
  imports: [SafePipe],
})
export class StampComponent {
  private readonly t = inject(TRANSLATE_FN);
  private readonly language = inject(LanguageService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly packs = inject(StampPackService);
  private readonly imageStorage = inject(ImageStorage);

  /** The stamp, by the identifier it is kept under. */
  readonly stampId = input.required<string>();
  /** The width and height of the box it is drawn in, in pixels. */
  readonly size = input(48);
  /** A number to bump, above 0, for the stamp to make its move again. */
  readonly play = input(0);
  /**
   * Whether the stamp's name shows where the pointer rests on it, as a list of stamps to choose from
   * wants. Off elsewhere, so a stamp drawn inside something with a name of its own, such as a
   * reaction naming who put it on, does not cover that name with its own.
   */
  readonly named = input(false);

  /**
   * The id this stamp's seal gives its filter, its own, so no seal leans on another's: one on a page
   * not drawn, in a closed list, would take the ink off every seal that pointed at it.
   */
  private readonly sealFilterId = `${SEAL_FILTER_ID}-${++stampsMade}`;

  protected readonly view = computed<(StampView & { fontSizePx: number }) | null>(() => {
    this.objectChange.fileVersion();
    this.language.currentLang();
    const view = stampViewOf(this.stampId(), roomStampViewSource(this.t, this.imageStorage, this.packs));
    if (!view) return null;
    const fontSizePx = view.kind === 'words' ? stampWordsSize(view.words, this.size()) : 0;
    if (view.kind === 'picture') {
      return { ...view, svg: view.svg.replaceAll(SEAL_FILTER_ID, this.sealFilterId), fontSizePx };
    }
    return { ...view, fontSizePx };
  });

  protected readonly hoverName = computed(() => (this.named() ? (this.view()?.name ?? null) : null));

  protected readonly edge = SOUND_EFFECT_EDGE;

  /** The class that makes the stamp's move, for a play number above 0. */
  protected motionClass(view: StampView, play: number): string | null {
    return play > 0 ? MOTION_CLASSES[view.motion] : null;
  }
}
