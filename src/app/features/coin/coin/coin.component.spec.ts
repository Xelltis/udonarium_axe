import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { Coin } from '@axe/domain/coin/coin';
import { CoinComponent } from '@axe/features/coin/coin/coin.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CoinComponent', () => {
  let component: CoinComponent;
  let fixture: ComponentFixture<CoinComponent>;
  let coin: Coin;
  let played: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CoinComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    fixture = TestBed.createComponent(CoinComponent);
    component = fixture.componentInstance;
    coin = Coin.create('コイン');
    coin.location.name = 'table';
    fixture.componentRef.setInput('coin', coin);
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as unknown as ChatMessage);
    played = vi.spyOn(TestBed.inject(PieceMotionsService), 'play').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    coin.destroy();
  });

  it('brings the coin to the top on a press, for a seat that may change the table alone', () => {
    const canEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    const topmost = vi.spyOn(coin, 'toTopmost');

    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).not.toHaveBeenCalled();

    canEdit.mockReturnValue(true);
    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).toHaveBeenCalledTimes(1);
  });

  it('says on its element which face is up, and which coin it is', () => {
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('data-face')).toBe('front');
    expect(host.getAttribute('data-object-id')).toBe(coin.identifier);

    coin.face = 'back';
    TestBed.inject(ObjectChangeService).notifyChanged(coin.identifier);
    fixture.detectChanges();
    expect(host.getAttribute('data-face')).toBe('back');
  });

  it('settles on a face when it is flipped', () => {
    vi.useFakeTimers();
    try {
      component.flip();
      vi.runAllTimers();

      expect(['front', 'back']).toContain(coin.face);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts spinning on word of a flip, and has the canvas play it', () => {
    vi.useFakeTimers();
    try {
      expect(component.isSpinning()).toBe(false);

      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });

      expect(component.isSpinning()).toBe(true);
      expect(played).toHaveBeenCalledWith(coin.identifier, 'coin-flip-turn', { backUp: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores word of another coin', () => {
    localDispatch('FLIP_COIN', { identifier: 'other-coin', face: 'back' });

    expect(component.isSpinning()).toBe(false);
    expect(played).not.toHaveBeenCalled();
  });

  it('keeps the result hidden until the canvas has played the flip', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      coin.face = 'back';
      TestBed.inject(ObjectChangeService).notifyChanged(coin.identifier);

      expect(component.displayedFace()).toBe('front');

      vi.advanceTimersByTime(1000);

      expect(component.displayedFace()).toBe('back');
      expect(component.isSpinning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds half a turn only when the face changes', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      expect(played).toHaveBeenLastCalledWith(coin.identifier, 'coin-flip-turn', { backUp: false });

      component.onSpinEnd();
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'front' });
      expect(played).toHaveBeenLastCalledWith(coin.identifier, 'coin-flip', { backUp: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not spin again when its own flip comes back over the network', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });

      expect(played).toHaveBeenCalledTimes(1);
      expect(component.displayedFace()).toBe('front');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts itself back once it stops', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });

      component.onSpinEnd();

      expect(component.isSpinning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
