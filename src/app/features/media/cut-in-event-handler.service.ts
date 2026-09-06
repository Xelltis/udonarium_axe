import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn, cutInPanelChrome } from '@axe/domain/media/cut-in';
import { asCutInMultiDirectionMode } from '@axe/domain/tabletop/cut-in-multi-direction';
import { makeCutInMultiDirectionLayout } from '@axe/features/media/cut-in-multi-direction-layout';
import { CutInWindowComponent } from '@axe/features/media/cut-in-window/cut-in-window.component';

export const CUT_IN_MULTI_DIRECTION_PREPARE_TIMEOUT_MS = 500;

@Injectable({ providedIn: 'root' })
export class CutInEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly panelService = inject(PanelService);
  private readonly tabletopDisplay = inject(TabletopDisplaySettingsService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly soundOnlyPlayer = new AudioPlayer();

  constructor() {
    this.objectChange.startCutIn$.subscribe((event) => {
      this.openCutInPanel(event.cutIn as CutIn);
    }, this.destroyRef);
    this.objectChange.soundOnlyCutIn$.subscribe((event) => {
      const cutIn = event.cutIn as CutIn;
      if (!cutIn) return;
      if (cutIn.videoId) {
        this.openCutInPanel(cutIn, true);
      } else {
        const audio = this.audioStorage.get(cutIn.audioIdentifier);
        if (audio) {
          const isSE = AudioTag.get(cutIn.audioIdentifier)?.tag === 'SE';
          this.soundOnlyPlayer.volumeType = isSE ? VolumeType.SE : VolumeType.MASTER;
          this.soundOnlyPlayer.loop = false;
          this.soundOnlyPlayer.play(audio);
        }
      }
    }, this.destroyRef);
  }

  private openCutInPanel(cutIn: CutIn, invisible = false): void {
    if (!cutIn) return;
    const mode = this.tabletopDisplay.enabled()
      ? asCutInMultiDirectionMode(this.tabletopDisplay.cutInMultiDirectionMode())
      : 'none';
    if (invisible || mode === 'none') {
      this.openSingleCutInPanel(cutIn, invisible);
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

      const component = this.panelService.open(CutInWindowComponent, option);
      component.cutIn = cutIn;
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

  private openSingleCutInPanel(cutIn: CutIn, invisible: boolean): void {
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

    const component = this.panelService.open(CutInWindowComponent, option);
    component.cutIn = cutIn;
    component.forceNoLoop = invisible;
    component.startCutIn();
  }
}
