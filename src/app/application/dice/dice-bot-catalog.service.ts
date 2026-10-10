import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { diceBotCatalog$ } from '@axe/core/event/domain-events';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { GameSystemInfo } from 'bcdice/lib/bcdice/game_system_list.json';

@Injectable({ providedIn: 'root' })
export class DiceBotCatalogService {
  private readonly _infos = signal<readonly GameSystemInfo[]>(DiceBot.diceBotInfos);
  readonly infos = this._infos.asReadonly();

  constructor() {
    diceBotCatalog$.subscribe(() => this._infos.set(DiceBot.diceBotInfos), inject(DestroyRef));
  }

  /** Loads the list of dice systems if it has not been loaded yet; `infos` updates when it arrives. */
  load(): Promise<void> {
    return DiceBot.ensureLoaded();
  }
}
