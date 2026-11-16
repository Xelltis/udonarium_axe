import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { Card, CardState } from '@axe/domain/card/card';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { CardFaceTextComponent } from '@axe/ui/components/card-face-text/card-face-text.component';

describe('CardFaceTextComponent', () => {
  let fixture: ComponentFixture<CardFaceTextComponent>;
  let card: Card;
  let objectChange: ObjectChangeService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CardFaceTextComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'me' } as IPeerContext);
    fixture = TestBed.createComponent(CardFaceTextComponent);
    objectChange = TestBed.inject(ObjectChangeService);
    card = Card.create('Card', 'front.png', 'back.png');
    fixture.componentRef.setInput('card', card);
  });

  afterEach(() => {
    card.destroy();
    vi.restoreAllMocks();
  });

  it('renders escaped and decorated text on a visible card', () => {
    card.faceText = '<script>alert(1)</script>\n|剣《つるぎ》';
    fixture.detectChanges();

    const face = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    expect(face).toBeTruthy();
    expect(face.querySelector('script')).toBeNull();
    expect(face.innerHTML).toContain('&lt;script&gt;');
    expect(face.querySelector('ruby')?.textContent).toContain('剣');
    expect(face.querySelector('br')).toBeNull();
    expect(face.querySelector('span')?.childNodes.length).toBeGreaterThan(1);
  });

  it('keeps ruby and adjacent text in the same inline formatting context', () => {
    card.faceText = 'a|b《c》d';
    fixture.detectChanges();

    const flow = fixture.nativeElement.querySelector('div > span') as HTMLSpanElement;
    const ruby = flow.querySelector('ruby');
    expect(flow.textContent).toBe('abcd');
    expect(ruby?.parentElement).toBe(flow);
    expect(flow.childNodes).toHaveLength(3);
  });

  it('does not create text DOM for a card hidden from this peer', () => {
    card.faceText = 'secret';
    card.state = CardState.BACK;
    card.owner = 'someone-else';
    objectChange.notifyChanged(card.identifier);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('div')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('secret');
  });

  it('shows face text in the owners hand', () => {
    card.faceText = 'private hand';
    card.toHand('me');
    objectChange.notifyChanged(card.identifier);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('private hand');
  });

  it('takes the colour the card was given rather than the theme', () => {
    card.faceText = 'ink';
    card.faceFontColor = '#ff8800';
    fixture.detectChanges();

    const face = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    expect(face.className).not.toContain('text-ui-text');
    expect(face.style.color).toBe('#ff8800');
  });

  it('follows synchronized child values and stack rotation', async () => {
    card.faceText = 'before';
    fixture.componentRef.setInput('rotation', 180);
    fixture.detectChanges();

    card.faceText = 'after';
    card.faceFontSize = 36;
    await fixture.whenStable();
    fixture.detectChanges();

    const face = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    expect(face.textContent).toContain('after');
    expect(face.style.fontSize).toBe('45px');
    expect(face.style.transform).toBe('rotateZ(180deg)');
    expect(face.className).not.toContain('text-shadow');
  });

  it('scales the font and padding for a preview without changing the text flow', () => {
    card.faceText = 'preview';
    fixture.componentRef.setInput('scale', 0.5);
    fixture.detectChanges();

    const face = fixture.nativeElement.querySelector('div') as HTMLDivElement;
    expect(face.style.fontSize).toBe('13.5px');
    expect(face.style.padding).toBe('4px');
    expect(face.style.transform).toBe('rotateZ(0deg)');
  });
});
