import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { isArtStampFamily, STAMP_FAMILIES, stampsOfFamily } from '@axe/domain/chat/stamp-catalog';
import { STAMP_USES, StampUse } from '@axe/domain/chat/stamp-rules';
import { StampComponent } from '@axe/ui/components/stamp/stamp.component';
import { TranslocoModule } from '@jsverse/transloco';

/** A family of stamps, or one of the room's sets, as the rules list them. */
interface StampGroup {
  readonly key: string;
  /** A family's name to translate, or null for a set, which has a name of its own. */
  readonly familyKey: string | null;
  readonly name: string;
  readonly stampIds: readonly string[];
  /** Whether its stamps are pictures, drawn larger. */
  readonly pictures: boolean;
}

/**
 * The room's rules for its stamps, one card to a use: sent as a line, and put on a line as a
 * reaction.
 *
 * Each use can be turned off as a whole, and each stamp allowed or denied it, a family or a set at a
 * time or one by one. Only the game master may change them; everyone else sees them as they stand.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-stamp-rules',
  templateUrl: './stamp-rules-editor.component.html',
  host: { class: 'contents' },
  imports: [StampComponent, TranslocoModule],
})
export class StampRulesEditorComponent {
  private readonly rules = inject(StampRulesService);
  private readonly packs = inject(StampPackService);

  protected readonly uses = STAMP_USES;
  protected readonly canChange = this.rules.canChange;

  protected readonly groups = computed<readonly StampGroup[]>(() => [
    ...STAMP_FAMILIES.map((family) => ({
      key: family,
      familyKey: `ui.stamp.families.${family}`,
      name: '',
      stampIds: stampsOfFamily(family).map((stamp) => stamp.id),
      pictures: isArtStampFamily(family),
    })),
    ...this.packs
      .packs()
      .filter((pack) => pack.stamps.length > 0)
      .map((pack) => ({
        key: `pack:${pack.identifier}`,
        familyKey: null,
        name: pack.name,
        stampIds: pack.stamps.map((stamp) => stamp.stampId),
        pictures: true,
      })),
  ]);

  /** Whether a use is on at all. */
  protected isOn(use: StampUse): boolean {
    return this.rules.isOn(use);
  }

  /** Whether a stamp is allowed a use, as the rules stand whether or not the use is on. */
  protected allowed(use: StampUse, stampId: string): boolean {
    return !this.rules.rules()[use].denied.includes(stampId);
  }

  /** How many of a group's stamps are allowed a use. */
  protected allowedCount(use: StampUse, group: StampGroup): number {
    const denied = this.rules.rules()[use].denied;
    return group.stampIds.filter((id) => !denied.includes(id)).length;
  }

  protected setOn(use: StampUse, on: boolean): void {
    this.rules.setOn(use, on);
  }

  protected toggle(use: StampUse, stampId: string): void {
    this.rules.setAllowed(use, [stampId], !this.allowed(use, stampId));
  }

  protected setGroup(use: StampUse, group: StampGroup, allowed: boolean): void {
    this.rules.setAllowed(use, group.stampIds, allowed);
  }
}
