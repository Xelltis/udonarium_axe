/** A text read from pasted writing: the heading it stood under, and the words up to the next. */
export interface ImportedScenarioText {
  readonly title: string;
  readonly text: string;
}

/** A heading: a line starting with one to six `#`, as Markdown writes it, or with `■`. */
const HEADING = /^(?:#{1,6}|■)[ \t\u3000]*(.*)$/;

/**
 * Splits writing pasted in at its headings, one text for each: the heading is the title, and the
 * lines up to the next heading are the words, the blank lines at either end left out. Writing
 * before the first heading is a text of its own with no title, where it holds any words; a heading
 * with no words under it is a text with none.
 */
export function splitScenarioTexts(pasted: string): ImportedScenarioText[] {
  const lines = pasted.replace(/\r\n?/g, '\n').split('\n');
  const texts: { title: string; lines: string[]; headed: boolean }[] = [{ title: '', lines: [], headed: false }];
  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) texts.push({ title: heading[1].trim(), lines: [], headed: true });
    else texts[texts.length - 1].lines.push(line);
  }
  return texts
    .map((text) => ({ title: text.title, text: trimBlankLines(text.lines).join('\n'), headed: text.headed }))
    .filter((text) => text.headed || text.text.length > 0)
    .map(({ title, text }) => ({ title, text }));
}

function trimBlankLines(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim().length < 1) start++;
  while (end > start && lines[end - 1].trim().length < 1) end--;
  return lines.slice(start, end);
}
