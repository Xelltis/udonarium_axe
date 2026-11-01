import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';
import { inlineStampSites } from '@axe/domain/chat/inline-stamp';

/** Who a scenario text is said as: under its own title, as the piece being spoken as, or as the room. */
export const SCENARIO_TEXT_SPEAKERS = ['title', 'character', 'system'] as const;
export type ScenarioTextSpeaker = (typeof SCENARIO_TEXT_SPEAKERS)[number];

/** Anything unknown, an empty value from a peer that never sent one included, is said under the title. */
export function scenarioTextSpeakerOf(value: unknown): ScenarioTextSpeaker {
  return typeof value === 'string' && (SCENARIO_TEXT_SPEAKERS as readonly string[]).includes(value)
    ? (value as ScenarioTextSpeaker)
    : 'title';
}

/**
 * A passage the game master writes before the session, to be said in the chat when the time
 * comes: a description, a handout, a line for somebody the players meet. It is written in the
 * chat's own marks, so it goes out decorated as it was written, and it is filed in folders as the
 * scenes are.
 *
 * Only the game master sees the texts. A room server keeps them from everyone else; between peers
 * they reach everyone, and only the screen keeps them from view.
 */
@SyncObject('scenario-text')
export class ScenarioText extends GameObject {
  @SyncVar() title = '';
  @SyncVar() text = '';
  /** The folder the text is filed in, as a path such as `第1話/導入`; empty for none. */
  @SyncVar() folderName = '';
  /** Where the text stands in the list, smaller first. */
  @SyncVar() order = 0;
  /** `title`, `character` or `system`. */
  @SyncVar() sendAs = '';
  /** The tab it is said in by default; empty for the tab being read. */
  @SyncVar() tab = '';
  /** The colour it is said in; empty for the speaker's own. */
  @SyncVar() color = '';
  /** The stamps put in the text, by identifier, so that a save finds their pictures. */
  @SyncVar() stamps = '';

  /** Every text in the room, in the order of the list. */
  static all(): ScenarioText[] {
    return ObjectStore.instance
      .getObjects(ScenarioText)
      .sort(
        (a, b) =>
          (Number(a.order) || 0) - (Number(b.order) || 0) ||
          (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0)
      );
  }

  /** The place after the last text in the list. */
  static nextOrder(): number {
    return ScenarioText.all().reduce((last, text) => Math.max(last, Number(text.order) || 0), 0) + 1;
  }

  /** Writes the passage, and which stamps it holds beside it. */
  write(text: string): void {
    this.text = text;
    const stamps = [...new Set(inlineStampSites(text).map((site) => site.id))].join(' ');
    if (this.stamps !== stamps) this.stamps = stamps;
  }

  /** What a save writes of the text, with its identifier. */
  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  /** Reads the text back from a save under the identifier written with it. */
  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes);
  }
}
