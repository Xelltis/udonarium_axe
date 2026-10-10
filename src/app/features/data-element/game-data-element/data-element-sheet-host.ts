import { InjectionToken } from '@angular/core';

/**
 * Provided by a full sheet, such as a character's, for the rows drawn inside it.
 *
 * A row on a sheet offers what a row elsewhere, such as in a chat palette, does not: ± buttons on a
 * number on a phone, and on a narrow sheet an editor of its own in place of the buttons beside it.
 */
export const IN_DATA_ELEMENT_SHEET = new InjectionToken<boolean>('IN_DATA_ELEMENT_SHEET');
