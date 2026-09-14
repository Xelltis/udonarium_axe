import { inject, Injectable } from '@angular/core';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { parseImportedCharacterJson } from '@axe/domain/character/import/character-import-format';
import { detectImportFetchPlan, ImportFetchPlan } from '@axe/domain/character/import/import-source';
import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { ImportedCharacterFactory } from '@axe/domain/character/import/imported-character-factory';
import { loadLabelMaps } from '@axe/domain/character/import/system-profiles/label-maps';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

export type CharacterImportError = 'unrecognized' | 'unsupported' | 'fetch-failed' | 'failed';

export interface CharacterImportResult {
  character: GameCharacter | null;
  error: CharacterImportError | null;
  imageResolved: boolean;
  service: string;
}

let jsonpCounter = 0;

/**
 * Builds a piece from pasted text and puts it on the table.
 *
 * The input may be any of:
 *   - pasted json from any of the supported sheet services
 *   - a url from the service that allows cross-origin requests, fetched directly
 *   - a url from the service that does not, fetched through a script tag
 *
 * Parsing and assembly belong to the domain; this service fetches, resolves images and
 * places the result — the parts that need web APIs and shared state.
 */
@Injectable({ providedIn: 'root' })
export class CharacterImportService {
  private readonly imageStorage = inject(ImageStorage);

  /**
   * Builds a character from pasted sheet JSON or a character sheet URL, fetching the sheet and its
   * portrait as needed.
   *
   * The piece is owned by you, and starts disclosed to game masters only when you are one. A
   * failure comes back as an error kind rather than a thrown error. A portrait that cannot be
   * fetched still leaves the character built, with `imageResolved` false.
   */
  async importFromText(text: string): Promise<CharacterImportResult> {
    const plan = detectImportFetchPlan(text);
    if (plan.kind === 'unsupported') {
      return { character: null, error: 'unsupported', imageResolved: false, service: plan.service };
    }

    let json: unknown;
    try {
      json = await this.fetchJson(plan, text);
    } catch {
      return { character: null, error: 'fetch-failed', imageResolved: false, service: serviceOf(plan) };
    }

    await loadLabelMaps();
    const imported = parseImportedCharacterJson(json, plan.kind === 'jsonp' ? plan.system : undefined);
    if (!imported) {
      return { character: null, error: 'unrecognized', imageResolved: false, service: serviceOf(plan) };
    }

    try {
      const imageIdentifier = await this.resolveImageIdentifier(imported);
      const character = ImportedCharacterFactory.create(imported, imageIdentifier);
      character.owner = PeerCursor.myCursor?.userId ?? '';
      if (PeerCursor.isMyselfGameMaster) character.disclosureMode = DisclosureMode.GameMaster;
      character.update();
      return { character, error: null, imageResolved: imageIdentifier !== '', service: imported.sourceFormat };
    } catch {
      return { character: null, error: 'failed', imageResolved: false, service: serviceOf(plan) };
    }
  }

  private async fetchJson(plan: ImportFetchPlan, text: string): Promise<unknown> {
    if (plan.kind === 'fetch') {
      const response = await fetch(plan.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(await response.text());
    }
    if (plan.kind === 'jsonp') {
      return this.loadJsonp(plan.url, plan.callbackParam);
    }
    return JSON.parse(text.trim());
  }

  /**
   * For a service that sends no cross-origin headers, fetch through an injected script tag rather than a proxy.
   */
  private loadJsonp(url: string, callbackParam: string, timeoutMs = 15000): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const callbackName = `__axeJsonp${++jsonpCounter}`;
      const script = document.createElement('script');
      const globals = window as unknown as Record<string, unknown>;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timer != null) clearTimeout(timer);
        delete globals[callbackName];
        script.remove();
      };

      globals[callbackName] = (data: unknown) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error('jsonp load error'));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('jsonp timeout'));
      }, timeoutMs);

      const separator = url.includes('?') ? '&' : '?';
      script.src = `${url}${separator}${callbackParam}=${callbackName}`;
      document.body.appendChild(script);
    });
  }

  /**
   * Fetches the portrait, registers it and returns its identifier.
   * A failed fetch returns nothing and the character is still built.
   */
  private async resolveImageIdentifier(imported: ImportedCharacter): Promise<string> {
    if (imported.iconImageIdentifier !== '') return imported.iconImageIdentifier;
    const url = imported.iconUrl.trim();
    if (url === '') return '';
    try {
      const response = await fetch(url);
      if (!response.ok) return '';
      const blob = await response.blob();
      const imageFile = await this.imageStorage.addAsync(blob);
      return imageFile.identifier;
    } catch {
      return '';
    }
  }
}

function serviceOf(plan: ImportFetchPlan): string {
  return plan.kind === 'json' ? 'json' : plan.kind === 'unsupported' ? plan.service : plan.service;
}
