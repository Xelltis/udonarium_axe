import { Pipe, PipeTransform } from '@angular/core';
import { linkifyIfLoaded } from '@axe/ui/text-decoration/linkify-loader';

@Pipe({ name: 'linkify', pure: false })
export class LinkifyPipe implements PipeTransform {
  private lastValue: string | null = null;
  private lastResult = '';
  private lastLinked = false;

  /**
   * Turns web addresses in a message into links that open in a new tab, without referrer or
   * opener; empty for null or undefined.
   *
   * The result is HTML, so it has to be bound as HTML to show the links. Linkify is fetched on
   * first use, and until it arrives the text comes back as it was given. The pipe is impure so
   * that the text is drawn again once it has, and it remembers its last answer, since it runs
   * on every check.
   */
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    const text = String(value);
    const linkify = linkifyIfLoaded();
    if (text === this.lastValue && this.lastLinked === !!linkify) return this.lastResult;
    this.lastValue = text;
    this.lastLinked = !!linkify;
    this.lastResult = linkify ? linkify.linkifyHtml(text, { target: '_blank', rel: 'noopener noreferrer' }) : text;
    return this.lastResult;
  }
}
