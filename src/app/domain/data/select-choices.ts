/**
 * Splits a select field's choices on line breaks or commas, trimming each and dropping blanks. Kept on
 * its own, apart from the table's layout, as the sheet's accessor reads choices wherever a piece is.
 */
export function parseSelectChoices(choices: string): string[] {
  return choices
    .split(/\r?\n|,/)
    .map((choice) => choice.trim())
    .filter((choice) => choice.length > 0);
}
