import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { Coin } from '@axe/domain/coin/coin';
import { CoinComponent } from '@axe/features/coin/coin/coin.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CoinComponent', () => {
  let component: CoinComponent;
  let fixture: ComponentFixture<CoinComponent>;
  let coin: Coin;

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    coin.destroy();
  });

  it('brings the coin to the top on a press, for a seat that may change the table alone', () => {
    const canEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
    const topmost = vi.spyOn(coin, 'toTopmost');

    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).not.toHaveBeenCalled();

    canEdit.mockReturnValue(true);
    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).toHaveBeenCalledTimes(1);
  });

  it('strikes both faces and turns each the way it lies', () => {
    fixture.detectChanges();
    const titles = [...fixture.nativeElement.querySelectorAll('svg title')].map(
      (title: SVGTitleElement) => title.textContent
    );
    expect(titles).toEqual(['表', '裏']);
    expect(fixture.nativeElement.querySelectorAll('svg polygon').length).toBeGreaterThan(0);
    expect(fixture.nativeElement.querySelectorAll('svg ellipse')).toHaveLength(component.laurelLeaves.length * 2);
    expect(component.faceTransform()).toContain('rotateY(0deg)');

    coin.face = 'back';
    TestBed.inject(ObjectChangeService).notifyChanged(coin.identifier);
    expect(component.faceTransform()).toContain('rotateY(180deg)');
  });

  it('parts the faces by the thickness and rings the edge between them', () => {
    fixture.detectChanges();
    const half = component.thickness() / 2;

    expect(component.thickness()).toBeGreaterThan(0);
    expect(component.frontFaceTransform()).toBe(`translateZ(${half}px)`);
    expect(component.backFaceTransform()).toBe(`rotateY(180deg) translateZ(${half}px)`);

    const segments = component.edgeSegments();
    expect(segments).toHaveLength(24);
    expect(segments[0].transform).toBe(`rotateZ(0deg) translateY(${-component.diameter() / 2}px) rotateX(90deg)`);
    expect(segments[6].transform).toContain('rotateZ(90deg)');
    expect(segments.every((segment) => segment.height === `${component.thickness()}px`)).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('div[style*="rotateX(90deg)"]')).toHaveLength(24);
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

  it('starts spinning on word of a flip', () => {
    vi.useFakeTimers();
    try {
      expect(component.isSpinning()).toBe(false);

      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      vi.runAllTimers();

      expect(component.isSpinning()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores word of another coin', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: 'other-coin', face: 'back' });
      vi.runAllTimers();

      expect(component.isSpinning()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the result hidden until it lands', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      vi.runAllTimers();
      coin.face = 'back';
      TestBed.inject(ObjectChangeService).notifyChanged(coin.identifier);

      expect(component.displayedFace()).toBe('front');
      expect(component.faceTransform()).toContain('rotateY(0deg)');

      component.onSpinEnd();

      expect(component.displayedFace()).toBe('back');
      expect(component.faceTransform()).toContain('rotateY(180deg)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds half a turn only when the face changes', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      vi.runAllTimers();
      expect(component.landsOnOtherFace()).toBe(true);

      component.onSpinEnd();
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'front' });
      vi.runAllTimers();
      expect(component.landsOnOtherFace()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not spin again when its own flip comes back over the network', () => {
    vi.useFakeTimers();
    try {
      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      vi.runAllTimers();
      component.isSpinning.set(true);

      localDispatch('FLIP_COIN', { identifier: coin.identifier, face: 'back' });
      vi.runAllTimers();

      expect(component.isSpinning()).toBe(true);
      expect(component.displayedFace()).toBe('front');
    } finally {
      vi.useRealTimers();
    }
  });

  it('puts itself back once it stops', () => {
    component.isSpinning.set(true);

    component.onSpinEnd();

    expect(component.isSpinning()).toBe(false);
  });
});
