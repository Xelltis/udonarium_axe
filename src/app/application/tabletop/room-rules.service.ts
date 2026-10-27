import { inject, Injectable } from '@angular/core';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { resolveRoomRules, RoomRules, RoomRuleValues } from '@axe/domain/tabletop/room-rules';
import { resolveZoneRules, ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';

/**
 * The rules the tables are played by, as the room has answered them.
 *
 * Read afresh every time, and followed by nothing of themselves: a computed that is to change with
 * them follows the room's config, and the table where the table has a say, as it always has.
 */
@Injectable({ providedIn: 'root' })
export class RoomRulesService {
  private readonly objectStore = inject(ObjectStore);

  /** The rules a table is played by: what the room answered, else what the table says, else the defaults. */
  rulesFor(table: Partial<RoomRuleValues> | null): RoomRules {
    return resolveRoomRules(this.config()?.roomRuleAnswers ?? null, table);
  }

  /** The rules the room plays engagement zones by. */
  zoneRules(): ZoneRules {
    return resolveZoneRules(this.config()?.zoneRuleAnswers ?? null);
  }

  private config(): Config | null {
    return this.objectStore.get<Config>('Config');
  }
}
