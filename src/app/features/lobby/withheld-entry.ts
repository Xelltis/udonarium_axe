import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { carriesWithheldInto, markTakenInWithheld } from '@axe/domain/peer/withheld-table';

/**
 * Asks before this seat goes into a room with a table that holds parts only in the shape a room
 * server withholds, which would spread there as they are. Unless the reader says to go in anyway,
 * it stays out.
 */
@Injectable({ providedIn: 'root' })
export class WithheldEntryService {
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);

  /**
   * Whether the seat may go into the room of the given key, null for a room without one, such as
   * one about to be made; going back into the room the table was withheld in asks nothing. Going in
   * anyway marks the table as holding withheld parts whatever role it is given there.
   */
  async mayEnter(roomKey: string | null): Promise<boolean> {
    if (!carriesWithheldInto(roomKey)) return true;
    const sure = await this.confirm.ask({
      title: this.t('feature.lobby.withheldEntry.title'),
      message: this.t('feature.lobby.withheldEntry.message'),
      okLabel: this.t('feature.lobby.withheldEntry.ok'),
      danger: true,
    });
    if (sure) markTakenInWithheld();
    return sure;
  }
}
