import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TranslocoModule } from '@jsverse/transloco';

/** One aimed-at piece as the panel shows it. */
interface FireRow {
  readonly id: string;
  readonly name: string;
  readonly distance: string;
  readonly zones: number;
  readonly pieces: readonly string[];
  readonly candidates: readonly string[];
}

/**
 * What stands between a piece and each piece it aims at: how far away it is, the zones and pieces
 * in the way, and who the shot may land on, with a button that picks one of them at random in chat.
 * A piece the reader cannot see goes unnamed.
 */
@Component({
  selector: 'line-of-fire-panel',
  templateUrl: './line-of-fire-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  imports: [TranslocoModule],
})
export class LineOfFirePanelComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly zones = inject(EngagementZoneService);
  private readonly vision = inject(VisionService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly macro = inject(CharacterMacroService);
  private readonly t = inject(TRANSLATE_FN);

  /** The piece firing, by its identifier. */
  readonly shooterIdentifier = signal('');

  /**
   * A row for each piece aimed at. Aiming is this reader's own and is not sent anywhere, so it is
   * heard from the word given whenever a piece is aimed at or let go, not from the pieces.
   */
  protected readonly rows = computed<FireRow[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.uiSignal.targetChange();
    this.zones.state();
    const shooter = this.objectStore.get<GameCharacter>(this.shooterIdentifier());
    if (!(shooter instanceof GameCharacter)) return [];
    const nameOf = (id: string) => {
      const piece = this.objectStore.get<GameCharacter>(id);
      return piece instanceof GameCharacter && this.vision.isTokenVisible(piece)
        ? piece.name
        : this.t('feature.zone.fire.unseen');
    };
    const rows: FireRow[] = [];
    for (const target of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      this.objectChange.versionOf(target.identifier)();
      if (!target.targeted || target === shooter || !target.isVisibleOnTable) continue;
      const report = this.zones.lineOfFireFor(shooter, target);
      if (!report) continue;
      rows.push({
        id: target.identifier,
        name: nameOf(target.identifier),
        distance: report.distanceM.toFixed(1),
        zones: report.zones.length,
        pieces: report.pieces.map(nameOf),
        candidates: report.candidates.map(nameOf),
      });
    }
    return rows;
  });

  /** Picks one of the pieces the shot may land on at random, said in chat as the piece firing. */
  protected pickAtRandom(row: FireRow): void {
    const shooter = this.objectStore.get<GameCharacter>(this.shooterIdentifier());
    if (!(shooter instanceof GameCharacter) || row.candidates.length < 2) return;
    void this.macro.sendAsCharacter(shooter, `choice[${row.candidates.join(',')}]`);
  }
}
