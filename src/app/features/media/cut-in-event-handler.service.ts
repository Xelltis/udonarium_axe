import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { Logger } from '@axe/core/logging/logger';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { CutIn, cutInPanelChrome } from '@axe/domain/media/cut-in';
import type { CutInSpeaker } from '@axe/domain/media/cut-in-speaker';
import { mixLevelOf } from '@axe/domain/media/mix-level';
import { asCutInMultiDirectionMode } from '@axe/domain/tabletop/cut-in-multi-direction';
import { makeCutInMultiDirectionLayout } from '@axe/features/media/cut-in-multi-direction-layout';
import type { CutInWindowComponent } from '@axe/features/media/cut-in-window/cut-in-window.component';
import { CUT_IN_WINDOW_LOADER, type CutInWindowType } from '@axe/features/media/cut-in-window-loader';

export const CUT_IN_MULTI_DIRECTION_PREPARE_TIMEOUT_MS = 500;

/** A cut-in asked for before the window arrived, and whether it was stopped meanwhile. */
interface WaitingCutIn {
  readonly cutIn: CutIn;
  cancelled: boolean;
}

@Injectable({ providedIn: 'root' })
export class CutInEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly panelService = inject(PanelService);
  private readonly tabletopService = inject(TabletopService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly loadWindow = inject(CUT_IN_WINDOW_LOADER);

  private readonly soundOnlyPlayer = new AudioPlayer();

  private windowType: CutInWindowType | null = null;
  private windowLoad: Promise<CutInWindowType> | null = null;
  private readonly waiting: WaitingCutIn[] = [];

  constructor() {
    // The same three ways an open window is closed, for a cut-in still waiting to open one. These
    // come first, so a sound-only cut-in puts aside those before it and not the one it asks for.
    this.objectChange.stopCutIn$.subscribe((event) => {
      const cutIn = event.cutIn as CutIn;
      this.cancelWaiting((waiting) => waiting.identifier == cutIn?.identifier);
    }, this.destroyRef);
    this.objectChange.stopCutInByBgm$.subscribe(() => {
      this.cancelWaiting((waiting) => waiting.tagName == '' && !!this.audioStorage.get(waiting.audioIdentifier));
    }, this.destroyRef);
    this.objectChange.soundOnlyCutIn$.subscribe((event) => {
      const cutIn = event.cutIn as CutIn;
      if (!cutIn?.videoId) return;
      this.cancelWaiting((waiting) => waiting.identifier == cutIn.identifier || waiting.tagName == cutIn.tagName);
    }, this.destroyRef);
    this.objectChange.startCutIn$.subscribe((event) => {
      const cutIn = event.cutIn as CutIn;
      // An open window closes for a cut-in with its name or its tag, and so does one still waiting,
      // before this one waits in turn.
      if (cutIn) {
        this.cancelWaiting((waiting) => waiting.identifier == cutIn.identifier || waiting.tagName == cutIn.tagName);
      }
      this.openCutInPanel(cutIn, false, (event.speaker as CutInSpeaker | null | undefined) ?? null);
    }, this.destroyRef);
    this.objectChange.soundOnlyCutIn$.subscribe((event) => {
      const cutIn = event.cutIn as CutIn;
      if (!cutIn) return;
      if (cutIn.videoId) {
        this.openCutInPanel(cutIn, true);
      } else {
        const audio = this.audioStorage.get(cutIn.audioIdentifier);
        if (audio) {
          this.soundOnlyPlayer.volumeType = VolumeType.CUT_IN;
          this.soundOnlyPlayer.loop = false;
          this.soundOnlyPlayer.trim = mixLevelOf(audio.identifier, 'music');
          this.soundOnlyPlayer.play(audio);
        }
      }
    }, this.destroyRef);
    // Fetched now rather than at the first cut-in, which would otherwise wait for it. A failure
    // is said by the cut-in that needs the window, which tries again.
    this.prepareWindow().catch(() => undefined);
  }

  /**
   * Fetches the code of the cut-in window, which nothing needs at start.
   *
   * The service starts this itself; a test awaits it to have cut-ins open at once.
   */
  prepareWindow(): Promise<CutInWindowType> {
    this.windowLoad ??= this.loadWindow().then(
      (windowType) => (this.windowType = windowType),
      (reason: unknown) => {
        this.windowLoad = null;
        throw reason;
      }
    );
    return this.windowLoad;
  }

  private cancelWaiting(matches: (cutIn: CutIn) => boolean): void {
    for (const request of this.waiting) {
      if (matches(request.cutIn)) request.cancelled = true;
    }
  }

  /** Opens at once when the window is here, and otherwise once it arrives, unless stopped meanwhile. */
  private withWindow(cutIn: CutIn, open: (windowType: CutInWindowType) => void): void {
    if (this.windowType) {
      open(this.windowType);
      return;
    }
    const request: WaitingCutIn = { cutIn, cancelled: false };
    this.waiting.push(request);
    const settle = () => this.waiting.splice(this.waiting.indexOf(request), 1);
    this.prepareWindow().then(
      (windowType) => {
        settle();
        if (!request.cancelled) open(windowType);
      },
      (reason: unknown) => {
        settle();
        Logger.error('[CutIn] カットインの窓を読み込めませんでした', reason);
        PanelService.loadFailureNotice?.();
      }
    );
  }

  private openCutInPanel(cutIn: CutIn, invisible = false, speaker: CutInSpeaker | null = null): void {
    if (!cutIn) return;
    this.withWindow(cutIn, (windowType) => this.openCutInPanelWith(windowType, cutIn, invisible, speaker));
  }

  private openCutInPanelWith(
    windowType: CutInWindowType,
    cutIn: CutIn,
    invisible: boolean,
    speaker: CutInSpeaker | null
  ): void {
    const mode = this.tabletopService.mode2d()
      ? asCutInMultiDirectionMode(this.tabletopService.display().cutInMultiDirectionMode)
      : 'none';
    if (invisible || mode === 'none') {
      this.openSingleCutInPanel(windowType, cutIn, invisible, speaker);
      return;
    }

    const chrome = cutInPanelChrome(cutIn);
    const faces = makeCutInMultiDirectionLayout({
      mode,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      cutInWidth: cutIn.width,
      cutInHeight: cutIn.height,
      chromeHeight: chrome,
    });
    const panels: { component: CutInWindowComponent; primary: boolean }[] = [];

    for (const face of faces) {
      const option: PanelOption = {
        title: this.t('feature.media.cutIn.panelTitleWith', { name: cutIn.name }),
        width: face.width,
        height: face.height,
        left: face.left,
        top: face.top,
        rotationDegrees: face.rotationDegrees,
        isCutIn: true,
        cutInIdentifier: cutIn.identifier,
        frameless: cutIn.frameless,
      };

      const component = this.panelService.open(windowType, option);
      component.cutIn = cutIn;
      component.speaker = speaker;
      component.audioEnabled = face.primary;
      component.panelLayout = face;
      panels.push({ component, primary: face.primary });
    }

    void this.startPreparedPanels(panels);
  }

  private async startPreparedPanels(panels: readonly { component: CutInWindowComponent; primary: boolean }[]) {
    await this.waitForPanelPreparation(panels.map(({ component }) => component.prepareCutIn()));

    const startedAtMs = Date.now();
    // South is opened last so that it is drawn on top, but it starts first here so its
    // one audio session owns the exact zero of the shared clock. Signals raised in this
    // loop are rendered together after the current task, so every face starts as one frame.
    const primaryFirst = [...panels].sort((left, right) => Number(right.primary) - Number(left.primary));
    for (const { component, primary } of primaryFirst) {
      component.startCutIn(startedAtMs, primary ? 0 : undefined);
    }
  }

  private waitForPanelPreparation(preparations: readonly Promise<void>[]): Promise<void> {
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, CUT_IN_MULTI_DIRECTION_PREPARE_TIMEOUT_MS);
      void Promise.allSettled(preparations).then(finish);
    });
  }

  private openSingleCutInPanel(
    windowType: CutInWindowType,
    cutIn: CutIn,
    invisible: boolean,
    speaker: CutInSpeaker | null
  ): void {
    const chrome = cutInPanelChrome(cutIn);
    const marginW = Math.max(0, window.innerWidth - cutIn.width);
    const marginH = Math.max(0, window.innerHeight - cutIn.height - chrome);

    const option: PanelOption = {
      title: this.t('feature.media.cutIn.panelTitleWith', { name: cutIn.name }),
      width: cutIn.width,
      height: cutIn.height + chrome,
      left: (marginW * cutIn.x_pos) / 100,
      top: (marginH * cutIn.y_pos) / 100,
      isCutIn: true,
      cutInIdentifier: cutIn.identifier,
      invisible,
      frameless: cutIn.frameless,
    };

    const component = this.panelService.open(windowType, option);
    component.cutIn = cutIn;
    component.speaker = speaker;
    component.forceNoLoop = invisible;
    component.startCutIn();
  }
}
