import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiceThrow, DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { MyDiceService } from '@axe/application/dice/my-dice.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { DiceLook, PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { MyDiceSettingComponent } from '@axe/features/dice/my-dice-setting/my-dice-setting.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MyDiceSettingComponent', () => {
  let fixture: ComponentFixture<MyDiceSettingComponent>;
  let tries: { look: DiceLook; color: string }[];
  let ended: number;

  function element<T extends HTMLElement>(testId: string): T {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as T;
  }

  async function settled(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.removeItem('my-dice');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.chatColorCode = ['#2b8a3e', '#000000', '#000000'];
    tries = [];
    ended = 0;
    TestBed.configureTestingModule({
      imports: [MyDiceSettingComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: DiceThrowService,
          useValue: {
            throws: signal<ReadonlyMap<string, DiceThrow>>(new Map()),
            tryOut: (look: DiceLook, color: string) => {
              tries.push({ look, color });
              return `try-out:${tries.length}`;
            },
            showStill: () => undefined,
            endTryOut: () => ended++,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(MyDiceSettingComponent);
  });

  afterEach(() => localStorage.removeItem('my-dice'));

  it('throws a die of each shape in the look as it opens, in the colour this seat speaks in', async () => {
    await settled();

    expect(tries).toEqual([{ look: PLAIN_DICE_LOOK, color: '#2b8a3e' }]);
  });

  it('lets the dice thrown to try the look out go as it closes', async () => {
    await settled();
    expect(ended).toBe(0);

    fixture.destroy();

    expect(ended).toBe(1);
  });

  it('keeps the material chosen and throws the dice again in it', async () => {
    await settled();

    element<HTMLButtonElement>('my-dice-material-marble').click();
    await settled();

    expect(TestBed.inject(MyDiceService).look().material).toBe('marble');
    expect(tries.at(-1)?.look.material).toBe('marble');
    expect(element('my-dice-material-marble').getAttribute('aria-checked')).toBe('true');
  });

  it('gives the dice a colour of their own, starting from the one this seat speaks in, and takes it back', async () => {
    await settled();
    const follows = element<HTMLInputElement>('my-dice-body-follows-roll');

    follows.click();
    await settled();
    expect(TestBed.inject(MyDiceService).look().body).toBe('#2b8a3e');

    element<HTMLInputElement>('my-dice-body-follows-roll').click();
    await settled();
    expect(TestBed.inject(MyDiceService).look().body).toBe('');
  });

  it('inks the numbers in a colour of their own once told not to choose one itself', async () => {
    await settled();

    element<HTMLInputElement>('my-dice-ink-auto').click();
    await settled();

    expect(TestBed.inject(MyDiceService).look().ink).toBe('#f6f3ec');
  });

  it('says glass is drawn as resin on a device drawn lightly', async () => {
    TestBed.inject(RenderLiteService).setting.set('on');
    await settled();
    expect(fixture.nativeElement.textContent).not.toContain('半透明は樹脂で描いています');

    element<HTMLButtonElement>('my-dice-material-glass').click();
    await settled();

    expect(fixture.nativeElement.textContent).toContain('半透明は樹脂で描いています');
  });

  describe('a picture for the dice', () => {
    const PICTURE = 'ab'.repeat(32);

    async function offer(file: File): Promise<void> {
      const input = element<HTMLInputElement>('my-dice-picture-file');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      await settled();
      await settled();
    }

    it('takes a picture offered and throws the dice again wearing it', async () => {
      const dice = TestBed.inject(MyDiceService);
      vi.spyOn(dice, 'setPicture').mockImplementation(async () => {
        dice.set({ ...dice.look(), picture: PICTURE });
        return null;
      });
      await settled();

      await offer(new File(['x'], 'stone.png', { type: 'image/png' }));

      expect(tries.at(-1)?.look.picture).toBe(PICTURE);
      expect(element('my-dice-picture-trouble')).toBeNull();
    });

    it('says why a picture was not taken', async () => {
      vi.spyOn(TestBed.inject(MyDiceService), 'setPicture').mockResolvedValue('tooLarge');
      await settled();

      await offer(new File(['x'], 'huge.png', { type: 'image/png' }));

      expect(element('my-dice-picture-trouble').textContent).toContain('8MB');
    });

    it('offers how to put the picture on, and holds the material to resin while it is worn', async () => {
      const dice = TestBed.inject(MyDiceService);
      dice.set({ ...dice.look(), picture: PICTURE });
      await settled();

      expect(element<HTMLButtonElement>('my-dice-material-metal').disabled).toBe(true);
      expect(element('my-dice-picture-fit-wrap').getAttribute('aria-checked')).toBe('true');

      element<HTMLButtonElement>('my-dice-picture-fit-faces').click();
      await settled();

      expect(dice.look().pictureFit).toBe('faces');
      expect(tries.at(-1)?.look.pictureFit).toBe('faces');
    });

    it('takes the picture off and gives the material back', async () => {
      const dice = TestBed.inject(MyDiceService);
      vi.spyOn(dice, 'removePicture').mockImplementation(() => dice.set({ ...dice.look(), picture: '' }));
      dice.set({ ...dice.look(), picture: PICTURE });
      await settled();

      element<HTMLButtonElement>('my-dice-picture-remove').click();
      await settled();

      expect(dice.look().picture).toBe('');
      expect(element<HTMLButtonElement>('my-dice-material-metal').disabled).toBe(false);
    });
  });
});
