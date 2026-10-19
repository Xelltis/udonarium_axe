import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LinkifyPipe } from '@axe/ui/pipes/linkify.pipe';
import { formatNoteText } from '@axe/ui/text-decoration/format-note-text';
import { forgetLinkify, linkifyIfLoaded, loadLinkify } from '@axe/ui/text-decoration/linkify-loader';

@Component({
  selector: 'test-linkify-host',
  template: `<p [innerHTML]="text() | linkify"></p>`,
  imports: [LinkifyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LinkifyHostComponent {
  readonly text = signal('https://example.com を見て');
}

describe('linkify fetched on first use', () => {
  // ng test keeps the loader across spec files in a worker, and other specs fetch linkify first.
  beforeEach(() => forgetLinkify());

  it('draws text without links until linkify arrives, then draws it again with them', async () => {
    const fixture = TestBed.createComponent(LinkifyHostComponent);
    const note = computed(() => formatNoteText('https://example.com'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('https://example.com を見て');
    expect(note()).not.toContain('<a');

    expect(await loadLinkify()).toBe(linkifyIfLoaded());
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(note()).toContain('<a href="https://example.com"');
  });
});
