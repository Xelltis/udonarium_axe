import { toHalfWidth } from '@axe/core/util/string-util';
import { CHARACTER_REFERENCE } from '@axe/domain/chat/chat-reference';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';

/** A line with the pictures it named taken out of its words, and every picture it now carries. */
export interface LiftedImageReferences {
  readonly text: string;
  readonly attachmentImageIdentifiers: string[];
}

/**
 * Takes the `{name}` references to a speaker's picture fields out of a line and attaches the
 * pictures instead.
 *
 * A reference to a field that is not a picture, or to no field, stays in the line, and so does a
 * `t{name}` reference, which reads the piece the line is aimed at. The pictures go after those
 * already attached, each once, and the spaces the references leave behind close up. A speaker
 * with no data takes nothing out and leaves the line as it was.
 */
export function liftImageReferences(
  text: string,
  root: DataElement | null,
  attached: readonly string[]
): LiftedImageReferences {
  if (!root) return { text, attachmentImageIdentifiers: [...attached] };

  const lifted = [...attached];
  const rest = text.replace(CHARACTER_REFERENCE, (match, name) => {
    if (match.match(/^[tTｔＴ].*/)) return match;

    const element = DataElement.findElementByReference(root, toHalfWidth(name));
    if (!element || element.fieldType !== DataElementFieldType.IMAGE) return match;

    const imageIdentifier = String(element.value ?? '').trim();
    if (imageIdentifier.length > 0 && !lifted.includes(imageIdentifier)) lifted.push(imageIdentifier);
    return '';
  });

  return { text: rest.replace(/[ \t]{2,}/g, ' ').trim(), attachmentImageIdentifiers: lifted };
}
