import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { HandRailComponent } from '@axe/features/card/hand-rail/hand-rail.component';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('HandRailComponent', () => {
  let component: HandRailComponent;
  let fixture: ComponentFixture<HandRailComponent>;

  function makeCard(locationName: string): Card {
    const card = Card.create('カード', 'front.png', 'back.png');
    card.location.name = locationName;
    return card;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HandRailComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(HandRailComponent);
    component = fixture.componentInstance;
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  it('lays out only the cards in your own hands', () => {
    const mine = makeCard(handLocationOf('me'));
    makeCard(handLocationOf('other'));
    makeCard('table');

    expect(component.cards()).toEqual([mine]);
  });

  it('leaves a card owned but left on the table out of the hand', () => {
    const peeked = makeCard('table');
    peeked.owner = 'me';

    expect(component.cards()).toEqual([]);
  });

  it('draws the rail only while it is open to somebody who may edit the table', async () => {
    const rail = TestBed.inject(HandRailService);

    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.hand-rail')).toBeNull();

    rail.open();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.hand-rail')).not.toBeNull();

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.hand-rail')).not.toBeNull();

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.hand-rail')).toBeNull();
  });

  it('draws the card text in your hand', async () => {
    const card = makeCard(handLocationOf('me'));
    card.faceText = '手札の文章';
    TestBed.inject(HandRailService).open();

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('card-face-preview')).toBeTruthy();
  });

  it('puts a card face up back onto the table and out of the hand', () => {
    const card = makeCard(handLocationOf('me'));

    (component as unknown as { playFaceUp: (c: Card) => void }).playFaceUp(card);

    expect(card.location.name).toBe('table');
    expect(card.state).toBe(CardState.FRONT);
    expect(component.cards()).toEqual([]);
  });

  it('puts one face down back onto the table still hidden', () => {
    const card = makeCard(handLocationOf('me'));

    (component as unknown as { playFaceDown: (c: Card) => void }).playFaceDown(card);

    expect(card.location.name).toBe('table');
    expect(card.state).toBe(CardState.BACK);
    expect(card.owner).toBe('');
  });

  it('moves the view to the card just played', () => {
    const card = makeCard(handLocationOf('me'));
    card.location.x = 120;
    card.location.y = 80;
    const selection = TestBed.inject(SelectionSignalService);

    (component as unknown as { playFaceUp: (c: Card) => void }).playFaceUp(card);

    expect(selection.focusCoordinate()).toEqual(expect.objectContaining({ x: 120, y: 80 }));
  });

  describe('giving a card from the hand', () => {
    const made: { destroy(): void }[] = [];

    function otherPlayer(userId: string, name: string): void {
      const cursor = new PeerCursor();
      cursor.userId = userId;
      cursor.peerId = `peer-${userId}`;
      cursor.name = name;
      cursor.role = PeerRole.Player;
      cursor.initialize();
      made.push(cursor);
    }

    function handCard(): Card {
      const card = makeCard(handLocationOf('me'));
      made.push(card);
      return card;
    }

    async function hoverOverTheHand(): Promise<void> {
      TestBed.inject(HandRailService).open();
      fixture.detectChanges();
      await fixture.whenStable();
      (fixture.nativeElement.querySelector('.hand-card') as HTMLElement).dispatchEvent(
        new PointerEvent('pointerenter')
      );
      fixture.detectChanges();
      await fixture.whenStable();
    }

    function giveButton(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="hand-card-give"]');
    }

    beforeEach(() => {
      // A cursor left behind by an earlier file would count as somebody to give to.
      for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) {
        if (cursor !== PeerCursor.myCursor && cursor.userId !== 'me') ObjectStore.instance.delete(cursor, false);
      }
    });

    afterEach(() => {
      for (const object of made.splice(0)) object.destroy();
    });

    it('offers the other participants and gives the card to the one picked', async () => {
      otherPlayer('other', 'あいて');
      const card = handCard();
      const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
      const announce = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null!);

      await hoverOverTheHand();
      giveButton()!.click();

      const actions = open.mock.calls[0][1];
      expect(actions.map((action) => action.name)).toEqual(['あいて']);
      actions[0].action!();
      expect(card.location.name).toBe(handLocationOf('other'));
      expect(announce).toHaveBeenCalledOnce();
    });

    it('offers no button while there is nobody else to give to', async () => {
      handCard();

      await hoverOverTheHand();

      expect(giveButton()).toBeNull();
    });
  });

  it('looks for the card just played where it stands, through the table focus', () => {
    const card = makeCard(handLocationOf('me'));
    const focusOn = vi.spyOn(TestBed.inject(TableFocusService), 'focusOn').mockImplementation(() => undefined);

    (component as unknown as { playFaceUp: (c: Card) => void }).playFaceUp(card);

    expect(focusOn).toHaveBeenCalledWith(card);
  });
});
