import { inject, Injectable } from '@angular/core';
import { MODEL_TYPE } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { bundledModelUrl } from '@axe/domain/tabletop/bundled-model-url';

/**
 * The 3D models bundled with the app as the room holds them: a bundled model's file is read into
 * the room's models the first time it is asked for, and the identifier it is held under is what a
 * piece or a block drawn as it carries, which every peer can fetch.
 */
@Injectable({ providedIn: 'root' })
export class BundledModelIntakeService {
  private readonly modelStorage = inject(ModelStorage);
  private readonly asked = new Map<string, Promise<string>>();

  /**
   * The identifier the room holds a model under: a bundled model's, read into the room where it is
   * not held there yet, or the name it was given as it is where that is no bundled model's. Empty
   * where a bundled model's file cannot be read; it is asked for afresh next time.
   */
  identifierOf(name: string): Promise<string> {
    if (!bundledModelUrl(name)) return Promise.resolve(name);
    const asked = this.asked.get(name);
    if (asked) return asked.then((held) => (held && this.modelStorage.get(held) ? held : this.readAfresh(name)));
    return this.readAfresh(name);
  }

  /** The identifiers the room holds each of the models named under, by name. */
  async identifiersOf(names: Iterable<string>): Promise<ReadonlyMap<string, string>> {
    const wanted = [...new Set(names)];
    const held = await Promise.all(wanted.map((name) => this.identifierOf(name)));
    return new Map(wanted.map((name, index) => [name, held[index]]));
  }

  private readAfresh(name: string): Promise<string> {
    const reading = this.read(name);
    this.asked.set(name, reading);
    void reading.then((held) => {
      if (!held && this.asked.get(name) === reading) this.asked.delete(name);
    });
    return reading;
  }

  private async read(name: string): Promise<string> {
    try {
      const url = bundledModelUrl(name);
      if (!url) return '';
      const response = await fetch(url);
      if (!response.ok) return '';
      const blob = await response.blob();
      const file = new File([blob], `${name}.glb`, { type: MODEL_TYPE });
      return (await this.modelStorage.addAsync(file))?.identifier ?? '';
    } catch {
      return '';
    }
  }
}
