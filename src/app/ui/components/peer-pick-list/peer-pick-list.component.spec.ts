import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { UiPeerPickListComponent } from '@axe/ui/components/peer-pick-list/peer-pick-list.component';

describe('UiPeerPickListComponent', () => {
  let fixture: ComponentFixture<UiPeerPickListComponent>;

  function cursorOf(peerId: string, name: string, dropped = false): PeerCursor {
    const cursor = new PeerCursor();
    cursor.initialize();
    cursor.peerId = peerId;
    cursor.name = name;
    cursor.isDisConnect = dropped;
    return cursor;
  }

  function make(peerIds: string[], selected: string[] = []): HTMLElement {
    fixture = TestBed.createComponent(UiPeerPickListComponent);
    fixture.componentRef.setInput('peerIds', peerIds);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('noControlLabel', '操作キャラなし');
    fixture.componentRef.setInput('disconnectedLabel', '切断');
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rowOf = (root: HTMLElement, peerId: string) => root.querySelector<HTMLElement>(`[data-peer-id="${peerId}"]`)!;
  const boxOf = (root: HTMLElement, peerId: string) => rowOf(root, peerId).querySelector<HTMLInputElement>('input')!;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UiPeerPickListComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    PeerCursor.forget();
  });

  it('lists a row for each seat, with its name and the words for no character', () => {
    cursorOf('peer-a', 'アリス');
    cursorOf('peer-b', 'ボブ').lastControlCharacterName = '盗賊';

    const root = make(['peer-a', 'peer-b']);

    expect(rowOf(root, 'peer-a').textContent).toContain('アリス');
    expect(rowOf(root, 'peer-a').textContent).toContain('操作キャラなし');
    expect(rowOf(root, 'peer-b').textContent).toContain('盗賊');
  });

  it('ticks the seats picked, and says of a dropped one that it has dropped', () => {
    cursorOf('peer-a', 'アリス');
    cursorOf('peer-b', 'ボブ', true);

    const root = make(['peer-a', 'peer-b'], ['peer-a']);

    expect(boxOf(root, 'peer-a').checked).toBe(true);
    expect(boxOf(root, 'peer-b').checked).toBe(false);
    expect(rowOf(root, 'peer-b').textContent).toContain('切断');
    expect(rowOf(root, 'peer-a').textContent).not.toContain('切断');
  });

  it('picks a seat from a click on its row and lets it go from another, keeping the others apart', async () => {
    cursorOf('peer-a', 'アリス');
    cursorOf('peer-b', 'ボブ');
    const root = make(['peer-a', 'peer-b']);
    const picked: (readonly string[])[] = [];
    fixture.componentInstance.selected.subscribe((selected) => picked.push(selected));

    rowOf(root, 'peer-a').click();
    rowOf(root, 'peer-b').click();
    rowOf(root, 'peer-a').click();
    await fixture.whenStable();

    expect(picked).toEqual([['peer-a'], ['peer-a', 'peer-b'], ['peer-b']]);
    expect(boxOf(root, 'peer-a').checked).toBe(false);
    expect(boxOf(root, 'peer-b').checked).toBe(true);
  });

  it('draws a name again once the cursor changes, with nobody asking it to look again', async () => {
    const cursor = cursorOf('peer-a', 'アリス');
    const root = make(['peer-a']);

    cursor.name = 'アリス改';
    TestBed.inject(ObjectChangeService).notifyChanged(cursor.identifier);
    await fixture.whenStable();

    expect(rowOf(root, 'peer-a').textContent).toContain('アリス改');
  });
});
