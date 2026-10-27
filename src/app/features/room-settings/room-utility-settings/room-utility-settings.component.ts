import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { BrowserDataWipeService } from '@axe/features/room-settings/browser-data-wipe.service';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The room settings' tools: bringing a piece in from an outside sheet, the replay, measuring this
 * screen, and wiping what the app keeps in this browser.
 *
 * The screen measurement describes this glass alone and is never written down.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-utility-settings',
  templateUrl: './room-utility-settings.component.html',
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class RoomUtilitySettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly browserDataWipe = inject(BrowserDataWipeService);
  private readonly displayCalibration = inject(DisplayCalibrationService);

  readonly isReadOnly = this.access.isReadOnly;
  protected readonly isCalibrated = this.displayCalibration.isCalibrated;
  protected readonly calibrationDpi = this.displayCalibration.dpi;
  protected readonly needsRecalibration = this.displayCalibration.needsRecalibration;

  /**
   * Opens the character import panel, which brings a piece in from an outside character sheet
   * service.
   */
  openCharacterImport(): void {
    this.roomPanels.open('characterImport');
  }

  /**
   * Opens the replay, for reading back a session recorded in this browser. Anyone may open it,
   * someone watching included: what may be recorded or edited is the replay's own to say.
   */
  openReplay(): void {
    this.roomPanels.open('replay');
  }

  /**
   * Throws away everything the app keeps in this browser and loads the page again, once the reader
   * has said they are sure. Anyone may, as it touches this browser alone.
   */
  wipeBrowserData(): void {
    void this.browserDataWipe.wipe();
  }

  /** Opens the dialog that measures this screen against an ID-1 card. */
  openCalibration(): void {
    this.access.openCalibration();
  }

  /** Makes the measured square larger or smaller by a number of steps, for the buttons beside the measurement. */
  nudgeScale(steps: number): void {
    this.displayCalibration.nudge(steps);
  }

  /** Back to an unmeasured screen. The width of a square stays, since the map still asks for it. */
  resetCalibration(): void {
    this.displayCalibration.reset();
  }
}
