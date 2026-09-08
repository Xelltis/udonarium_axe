import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ChatSettingsEventHandlerService } from '@axe/features/chat/chat-settings-event-handler.service';
import {
  autoChatBubble,
  CHAT_WARN_RATIO,
  chatColorContrast,
  ChatColorStylePipe,
  cssToHex,
} from '@axe/ui/pipes/chat-color-style.pipe';
import { TranslocoModule } from '@jsverse/transloco';

export type ChatTheme = 'light' | 'dark';

/**
 * The colours offered without having to open a picker.
 *
 * Picking a legible colour out of a wheel is a chore nobody wants before speaking, and these
 * are the ones the tool has always offered: a dark and a light of each hue, spread round it.
 * Yellow was the one hue missing, and sixteen fills the two rows they are laid out in.
 */
/** How many swatches a row of the palette holds, which the count of them has to divide into. */
export const PRESET_COLUMNS = 8;

export const CHAT_PRESET_COLORS: readonly string[] = [
  '#000000',
  '#999999',
  '#990000',
  '#FF0000',
  '#FF6633',
  '#FFCC00',
  '#669933',
  '#00CC33',
  '#009966',
  '#33CCFF',
  '#0099FF',
  '#3366FF',
  '#003399',
  '#9933CC',
  '#663366',
  '#FF66FF',
];

@Component({
  selector: 'chat-color-setting',
  templateUrl: './chat-color-setting.component.html',
  host: { class: 'block px-3 py-[10px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, ChatColorStylePipe, NgStyle],
})
export class ChatColorSettingComponent {
  /** The panels a bubble has to read against, which a skin may have moved. */
  protected readonly skins = inject(SkinService);

  private readonly modalService = inject(ModalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chatSettings = inject(ChatSettingsEventHandlerService);

  readonly themes: readonly ChatTheme[] = ['light', 'dark'];
  readonly slots = [0, 1, 2] as const;
  readonly presets = CHAT_PRESET_COLORS;

  /** Which of the three is being worked on, the other two waiting behind their own buttons. */
  readonly editing = signal(0);

  isAllowedEmpty: boolean = false;
  tabletopObject: GameCharacter | null = null;

  /** Bumped by hand, since the colours live on arrays that no sync var watches element by element. */
  protected readonly revision = signal(0);

  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  constructor() {
    const option = this.modalService.option as Record<string, unknown>;
    this.isAllowedEmpty = !!option?.isAllowedEmpty;
  }

  private get owner(): GameCharacter | PeerCursor {
    return this.tabletopObject ?? this.myPeer;
  }

  chatColorCode(num: number): string {
    this.revision();
    return this.owner.chatColorCode[num];
  }

  bubbleCode(num: number, theme: ChatTheme): string {
    this.revision();
    const codes = theme === 'dark' ? this.owner.chatBubbleDark : this.owner.chatBubbleLight;
    return codes[num] ?? '';
  }

  /**
   * What the bubble will actually be: the one that was set, or the one worked out for it.
   *
   * Both ladders are shown side by side here, so the tone each is measured against is asked
   * for by name. Read off the screen instead, the one not on it would be worked out against
   * the standard page rather than against the skin that ladder is wearing.
   */
  shownBubble(num: number, theme: ChatTheme): string {
    return this.bubbleCode(num, theme) || autoChatBubble(this.chatColorCode(num), theme, this.skins.toneOf(theme));
  }

  contrastOf(num: number, theme: ChatTheme): number {
    return chatColorContrast(this.chatColorCode(num), this.bubbleCode(num, theme), theme, this.skins.toneOf(theme));
  }

  isHardToRead(num: number, theme: ChatTheme): boolean {
    return this.contrastOf(num, theme) < CHAT_WARN_RATIO;
  }

  /** The page each preview sits on, so a dark sample reads as a dark room and not as the panel. */
  backdrop(theme: ChatTheme): string {
    return theme === 'dark' ? '#0d1117' : '#d4c8e2';
  }

  labelColor(theme: ChatTheme): string {
    return theme === 'dark' ? '#8b949e' : '#5b4074';
  }

  changeColor(event: string, num: number): void {
    if (this.tabletopObject) {
      this.tabletopObject.chatColorCode[num] = event;
      this.bumpCharacter();
    } else {
      this.myPeer.chatColorCode[num] = event;
      this.chatSettings.captureColors();
    }
    this.touched();
  }

  changeBubble(event: string, num: number, theme: ChatTheme): void {
    const codes = theme === 'dark' ? this.owner.chatBubbleDark : this.owner.chatBubbleLight;
    codes[num] = event;
    if (this.tabletopObject) this.bumpCharacter();
    else this.chatSettings.captureColors();
    this.touched();
  }

  /** Puts the bubble where the colour can be read on it, and leaves it there to be edited. */
  autoAdjust(num: number, theme: ChatTheme): void {
    this.changeBubble(cssToHex(autoChatBubble(this.chatColorCode(num), theme, this.skins.toneOf(theme))), num, theme);
  }

  clearBubble(num: number, theme: ChatTheme): void {
    this.changeBubble('', num, theme);
  }

  onChangeColor(event: Event, index: number): void {
    this.changeColor((event.target as HTMLInputElement).value, index);
  }

  onChangeBubble(event: Event, index: number, theme: ChatTheme): void {
    this.changeBubble((event.target as HTMLInputElement).value, index, theme);
  }

  /** Colours are written down in whichever case the picker felt like, so they are matched loosely. */
  sameColor(one: string, other: string): boolean {
    return one.toLowerCase() === other.toLowerCase();
  }

  get speakerName(): string {
    return this.tabletopObject?.name || this.myPeer.name;
  }

  private bumpCharacter(): void {
    const object = this.tabletopObject;
    if (!object) return;
    object.syncDummyCounter = object.syncDummyCounter < 2 ? object.syncDummyCounter + 1 : 0;
  }

  private touched(): void {
    this.revision.update((value) => value + 1);
    this.objectChange.notifyChanged(this.owner.identifier);
  }
}
