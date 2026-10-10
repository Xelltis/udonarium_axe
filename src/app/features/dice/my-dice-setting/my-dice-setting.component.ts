import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DiceFrame, DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { DicePictureTrouble, MyDiceService } from '@axe/application/dice/my-dice.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import {
  DICE_MATERIALS,
  DICE_PICTURE_FITS,
  DiceLook,
  DiceMaterial,
  DicePictureFit,
} from '@axe/domain/dice/dice-3d/dice-look';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { DiceTrayFrameComponent } from '@axe/ui/components/dice-roll-stage/dice-tray-frame.component';
import { TranslocoModule } from '@jsverse/transloco';

/** Colours dice are commonly cast in, offered without having to open a picker. */
export const BODY_SWATCHES: readonly string[] = [
  '#f2efe6',
  '#1a1a1a',
  '#c92a2a',
  '#e8590c',
  '#f2c94c',
  '#2b8a3e',
  '#1971c2',
  '#5f3dc4',
  '#d6336c',
  '#868e96',
  '#b08d57',
  '#adb5bd',
];

/** Colours numbers are commonly inked in. */
export const INK_SWATCHES: readonly string[] = ['#f6f3ec', '#161616', '#e8c547', '#c92a2a', '#1971c2', '#adb5bd'];

/** A colour to start from when a die is first given one of its own, where the seat's chat colour is none. */
const FIRST_BODY = '#1971c2';
const FIRST_INK = '#f6f3ec';

/**
 * Where a seat chooses how its dice look: what they are made of, their colour and the colour of
 * their numbers. Everyone sees this seat's rolls in it, so a die of each shape is thrown in it here
 * to see it by, again with every change.
 */
@Component({
  selector: 'my-dice-setting',
  templateUrl: './my-dice-setting.component.html',
  imports: [TranslocoModule, DiceTrayFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full overflow-y-auto' },
})
export class MyDiceSettingComponent {
  private readonly myDice = inject(MyDiceService);
  private readonly throws = inject(DiceThrowService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly objectChange = inject(ObjectChangeService);

  protected readonly materials = DICE_MATERIALS;
  protected readonly fits = DICE_PICTURE_FITS;
  protected readonly bodySwatches = BODY_SWATCHES;
  protected readonly inkSwatches = INK_SWATCHES;
  protected readonly look = this.myDice.look;

  private readonly tryKey = signal('');

  /** The dice thrown to see the look by. */
  protected readonly tryFrame = computed<DiceFrame | null>(() => {
    const key = this.tryKey();
    const diceThrow = this.throws.throws().get(key);
    if (!diceThrow || diceThrow.phase === 'failed') return null;
    return { key, aspect: diceThrow.aspect, overflow: 0, diceThrow };
  });

  /** What was wrong with the last picture offered, for the line under it. */
  protected readonly trouble = signal<DicePictureTrouble | ''>('');

  /** Where the picture on the dice can be shown from, once it is among the room's images. */
  protected readonly pictureUrl = computed(() => {
    this.objectChange.fileVersion();
    const picture = this.look().picture;
    return picture ? ImageStorage.instance.get(picture)?.url || null : null;
  });

  /** Whether glass is chosen on a device that draws it as resin, which this seat should be told. */
  protected readonly glassDrawnAsResin = computed(
    () => this.look().material === 'glass' && !this.look().picture && this.renderLite.active()
  );

  constructor() {
    void this.myDice.ensureShared();
    this.roll();
    inject(DestroyRef).onDestroy(() => this.throws.endTryOut());
  }

  protected choose(material: DiceMaterial): void {
    this.change({ material });
  }

  /** Lets the dice take the colour each roll is said in, or gives them one of their own to start from. */
  protected followRollColor(event: Event): void {
    const follow = (event.target as HTMLInputElement).checked;
    this.change({ body: follow ? '' : this.rollColor() || FIRST_BODY });
  }

  protected setBody(color: string): void {
    this.change({ body: color });
  }

  /** Has the numbers inked to stand out from the body, or gives them a colour of their own to start from. */
  protected inkByItself(event: Event): void {
    const auto = (event.target as HTMLInputElement).checked;
    this.change({ ink: auto ? '' : FIRST_INK });
  }

  protected setInk(color: string): void {
    this.change({ ink: color });
  }

  /** Takes the picture chosen for the dice, or says why it was not taken. */
  protected async takePicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const trouble = await this.myDice.setPicture(file);
    this.trouble.set(trouble ?? '');
    if (!trouble) this.roll();
  }

  protected removePicture(): void {
    this.myDice.removePicture();
    this.trouble.set('');
    this.roll();
  }

  protected fitPicture(fit: DicePictureFit): void {
    this.myDice.setPictureFit(fit);
    this.roll();
  }

  /** Throws a die of each shape in the look as it stands. */
  protected roll(): void {
    this.tryKey.set(this.throws.tryOut(this.look(), this.rollColor()));
  }

  protected colorFrom(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  private change(part: Partial<DiceLook>): void {
    this.myDice.set({ ...this.look(), ...part });
    this.roll();
  }

  /** The colour this seat speaks in, which a die with no colour of its own takes. */
  private rollColor(): string {
    return PeerCursor.myCursor?.chatColorCode?.[0] ?? '';
  }
}
