import { Pipe, PipeTransform } from '@angular/core';
import linkifyHtml from 'linkify-html';

@Pipe({ name: 'linkify' })
export class LinkifyPipe implements PipeTransform {
  /**
   * Turns web addresses in a message into links that open in a new tab, without referrer or
   * opener; empty for null or undefined.
   *
   * The result is HTML, so it has to be bound as HTML to show the links.
   */
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return linkifyHtml(String(value), { target: '_blank', rel: 'noopener noreferrer' });
  }
}
