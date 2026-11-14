import { computed, inject, signal } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { clamp } from '@axe/core/util/clamp';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatBubbleColors, chatBubbleOf, chatColorOf, DEFAULT_CHAT_COLOR } from '@axe/domain/chat/chat-color';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { ChatColorSettingComponent } from '@axe/features/chat/chat-color-setting/chat-color-setting.component';
import { chatColorStyle } from '@axe/ui/pipes/chat-color-style.pipe';

const COLOR_SETTING_PANEL = 'chat-color-setting';

/** The three slots a speaker's colours are kept in. */
export const CHAT_COLOR_SLOTS = [0, 1, 2] as const;

/** The class of a button in the bar over a chat input's box, which its popovers' buttons share. */
export const CHAT_INPUT_BAR_BUTTON_CLASS =
  'text-ui-muted hover:bg-ui-hover hover:text-ui-text aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent aria-expanded:bg-ui-hover rounded-ui-sm m-0 flex h-7 min-w-6 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors hover:shadow-none [&_.material-icons]:text-[17px]! pointer-coarse:h-8 pointer-coarse:min-w-8';

/** What the colours of a chat input's lines are read from. */
export interface ChatInputColorsHost {
  /** The identifier of who is speaking, a character or this seat's own cursor. */
  sendFrom(): string;
}

/**
 * The colours the lines of one chat input go out in: the slot chosen, the colour and bubble of each
 * slot for whoever is speaking, and how each looks on this reader's theme.
 *
 * Made where services can be injected, as a field of the input it belongs to.
 */
export class ChatInputColors {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly theme = inject(ThemeService);
  private readonly skins = inject(SkinService);
  private readonly panelService = inject(PanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly t = inject(TRANSLATE_FN);

  constructor(private readonly host: ChatInputColorsHost) {}

  /** Which of the three slots the next line is sent in. */
  readonly selected = signal(0);

  /** Chooses the slot the next line uses; values outside 0 to 2 are clamped. */
  select(slot: number): void {
    this.selected.set(clamp(slot, 0, 2));
  }

  private get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /**
   * Whether the colours of the lines come from the character spoken as: they do but for a guest,
   * whose colour panel sets the colours of their own lines instead.
   */
  private colorsFromCharacter(object: unknown): object is GameCharacter {
    this.objectChange.trackMyCursor();
    return object instanceof GameCharacter && canRoleEdit(PeerCursor.myRole);
  }

  /**
   * The speaking character's chat colour in the given slot, or the default colour when the speaker
   * is not a character.
   */
  characterColorOf(slot: number): string {
    const object = this.objectStore.get(this.host.sendFrom());
    if (!(object instanceof GameCharacter)) return DEFAULT_CHAT_COLOR;
    this.objectChange.versionOf(object.identifier)();
    return chatColorOf(object, slot);
  }

  /** This seat's own chat colour in the given slot. */
  playerColorOf(slot: number): string {
    this.objectChange.versionOf(this.myPeer.identifier)();
    return chatColorOf(this.myPeer, slot);
  }

  /**
   * The speaker's chat colour in the given slot, taken from the character or from this seat's own
   * cursor.
   */
  colorOf(slot: number): string {
    const object = this.objectStore.get(this.host.sendFrom());
    if (this.colorsFromCharacter(object)) return this.characterColorOf(slot);
    return this.playerColorOf(slot);
  }

  /** The bubble the sender asked for on each theme, which travels with the message. */
  bubblesOf(slot: number): ChatBubbleColors {
    const object = this.objectStore.get(this.host.sendFrom());
    const source = this.colorsFromCharacter(object) ? object : this.myPeer;
    this.objectChange.versionOf(source.identifier)();
    return chatBubbleOf(source, slot);
  }

  /** The colour in the slot currently chosen, which the next line is sent in. */
  get selectedColor(): string {
    return this.colorOf(this.selected());
  }

  /** The bubbles of the slot currently chosen, which travel with the next line. */
  get selectedBubbles(): ChatBubbleColors {
    return this.bubblesOf(this.selected());
  }

  /**
   * The colour a line is shown in from each of the three slots and the bubble it sits on, on this
   * reader's theme: the box written in shows the chosen one, and the colour buttons draw each as a sample.
   */
  readonly looks = computed(() => {
    const theme = this.theme.resolved();
    const tone = this.skins.toneOf(theme);
    return CHAT_COLOR_SLOTS.map((slot) => {
      const bubbles = this.bubblesOf(slot);
      return chatColorStyle(this.colorOf(slot), theme, theme === 'dark' ? bubbles.dark : bubbles.light, tone);
    });
  });

  /** How the line being written will look, in the slot chosen. */
  readonly lineLook = computed(() => this.looks()[this.selected()]);

  /**
   * The colour the line is sent in, drawn under the letter of the colour button and ringed with its
   * bubble, so a dark ink still shows on a dark bar.
   */
  readonly lineInk = computed(() => {
    const look = this.lineLook();
    return {
      'background-color': look?.['color'] ?? this.selectedColor,
      'box-shadow': `0 0 0 1px ${look?.['background-color'] ?? 'var(--ui-border-panel)'}`,
    };
  });

  /**
   * Opens the chat colour settings for the speaker, or closes them if they are already open.
   *
   * A character speaker gets its own colours; a guest, who may not write a piece, and a seat
   * speaking as itself set the colours of their own lines instead.
   */
  openSetting(): void {
    if (this.panelService.closeSingle(COLOR_SETTING_PANEL)) return;
    const object = this.objectStore.get(this.host.sendFrom());
    const character = object instanceof GameCharacter && canRoleEdit(PeerCursor.myRole) ? object : null;
    const coordinate = this.pointerDeviceService.pointers[0];
    const title = character?.name.length
      ? this.t('feature.chat.input.colorSettingWithChar', { name: character.name })
      : this.t('feature.chat.input.colorSetting');
    const option: PanelOption = {
      title,
      left: coordinate.x + 50,
      top: coordinate.y - (character ? 200 : 150),
      width: 384,
      height: character ? 300 : 282,
      single: COLOR_SETTING_PANEL,
    };
    const component = this.panelService.open<ChatColorSettingComponent>(ChatColorSettingComponent, option);
    component.tabletopObject = character;
  }
}
