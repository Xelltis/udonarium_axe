import { computed, inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VnStage, VnStageTransition } from '@axe/domain/visual-novel/vn-stage';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

const STAGE_IDENTIFIER = 'VnStage';

@Injectable({ providedIn: 'root' })
export class VisualNovelSceneService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly imageService = inject(ImageService);
  private readonly modalService = inject(ModalService);
  private readonly chatMessageService = inject(ChatMessageService);

  private get stage(): VnStage | null {
    return this.objectStore.get<VnStage>(STAGE_IDENTIFIER) ?? null;
  }

  readonly backgroundUrl = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    this.objectChange.fileVersion();
    const identifier = this.stage?.backgroundImageIdentifier ?? '';
    if (identifier.length < 1) return '';
    return this.imageService.getEmptyOr(identifier).url;
  });

  readonly hasBackground = computed(() => this.backgroundUrl().length > 0);

  readonly transition = computed<VnStageTransition>(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.transition ?? 'fade';
  });

  readonly transitionTrigger = computed(() => {
    this.objectChange.versionOf(STAGE_IDENTIFIER)();
    return this.stage?.transitionTrigger ?? 0;
  });

  readonly canDirect = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  /**
   * Opens the image picker and sets the chosen picture as the novel stage's background for everyone.
   *
   * The change plays the current transition; the empty choice clears the background, and closing the
   * picker changes nothing. Only the game master may do this.
   */
  pickBackground(): void {
    if (!this.canDirect()) return;
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      const stage = this.stage;
      if (!stage || typeof identifier !== 'string') return;
      stage.setBackground(identifier);
    });
  }

  /** Removes the novel stage's background for everyone with the current transition; game master only. */
  clearBackground(): void {
    if (!this.canDirect()) return;
    this.stage?.clearBackground();
  }

  /** Chooses the transition the stage plays on a background change, for everyone; game master only. */
  setTransition(transition: VnStageTransition): void {
    if (!this.canDirect()) return;
    const stage = this.stage;
    if (!stage) return;
    stage.transition = transition;
    stage.update();
  }

  /** Plays the current transition on every screen without changing the background; game master only. */
  playTransition(): void {
    if (!this.canDirect()) return;
    this.stage?.playTransition();
  }

  /**
   * Clears the portraits standing on a tab, without anybody having to speak to do it.
   *
   * A character leaves the stage by saying something marked as leaving, and a scene change
   * sweeps it by being said, so a cast that has walked out of the scene stands there until
   * somebody talks. This draws a line across the log instead: nothing said before it stands
   * while the reader is looking at anything after it, and reading back shows the stage as it
   * was. The log itself is untouched.
   *
   * The line is drawn at the moment of the notice rather than at the clock, because a tab's
   * timestamps are made to keep going forward whatever the clocks of the peers say, so a line
   * anywhere else could leave the last thing said standing on the wrong side of it.
   */
  resetStage(tab: ChatTab): void {
    if (!this.canDirect()) return;
    const cursor = PeerCursor.myCursor;
    const notice = this.chatMessageService.sendSystemMessageToTab(
      tab,
      encodeI18nMessage('feature.visualNovel.stageResetBy', { user: cursor?.name?.trim() || cursor?.identifier || '' }),
      undefined,
      cursor?.userId,
      true
    );
    tab.vnPortraitResetAt = notice.placedAt;
  }
}
