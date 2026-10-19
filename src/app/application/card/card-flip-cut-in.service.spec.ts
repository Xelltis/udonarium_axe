import { TestBed } from '@angular/core/testing';
import { CardFlipCutInService, FACE_WAIT_MS } from '@axe/application/card/card-flip-cut-in.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CutIn } from '@axe/domain/media/cut-in';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardFlipCutInService', () => {
  let service: CardFlipCutInService;
  let launch: ReturnType<typeof vi.spyOn>;

  const settled = async () => {
    for (let i = 0; i < 3; i++) await Promise.resolve();
  };

  /** A card named for a cut-in, with its face taken away as a room server withholds it from a player. */
  function withheldCard(): { card: Card; giveFace: () => void } {
    const card = Card.create('ドラゴン', './front.png', './back.png');
    card.initialize();
    const front = card.imageDataElement!.getFirstElementByName('front')!;
    const name = card.commonDataElement!.getFirstElementByName('name')!;
    card.imageDataElement!.removeChild(front);
    card.commonDataElement!.removeChild(name);
    return {
      card,
      giveFace: () => {
        card.imageDataElement!.appendChild(front);
        card.commonDataElement!.appendChild(name);
      },
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CardFlipCutInService);
    launch = vi.spyOn(TestBed.inject(CutInService), 'launch').mockReturnValue(true);
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
    const cutIn = new CutIn('dragon-cut-in');
    cutIn.name = 'ドラゴン';
    cutIn.initialize();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('plays the cut-in named like a card turned up before its face came, once the face comes', async () => {
    const { card, giveFace } = withheldCard();

    expect(service.playFor(card)).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    giveFace();
    await settled();

    expect(launch).toHaveBeenCalledTimes(1);
  });

  it('stops watching for the face after a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { card, giveFace } = withheldCard();

    service.playFor(card);
    vi.advanceTimersByTime(FACE_WAIT_MS);
    giveFace();
    await settled();

    expect(launch).not.toHaveBeenCalled();
  });
});
