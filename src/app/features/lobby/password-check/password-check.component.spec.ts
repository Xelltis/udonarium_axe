import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { PeerContext } from '@axe/core/network/peer-context';
import {
  PasswordCheckComponent,
  type PasswordCheckOptions,
} from '@axe/features/lobby/password-check/password-check.component';

function setModalOption(modalService: ModalService, option: PasswordCheckOptions): void {
  (modalService as unknown as Record<string, unknown>).modalContext = { option };
}

describe('PasswordCheckComponent', () => {
  let component: PasswordCheckComponent;
  let fixture: ComponentFixture<PasswordCheckComponent>;
  let modalService: ModalService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PasswordCheckComponent],
    }).compileComponents();
  });

  beforeEach(() => {
    modalService = TestBed.inject(ModalService);
    setModalOption(modalService, {
      peerContext: PeerContext.parse('test-peer-id'),
      title: 'Test Title',
    });
    fixture = TestBed.createComponent(PasswordCheckComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('submit()', () => {
    let resolveSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      resolveSpy = vi.spyOn(modalService, 'resolve').mockImplementation(() => {});
    });

    it('resolves with the right password', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn((component as any).targetPeerContext, 'verifyPassword').mockResolvedValue(true);
      component.password.set('correct');

      await component.submit();

      expect(resolveSpy).toHaveBeenCalledWith('correct');
    });

    it('says nothing about a wrong one', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn((component as any).targetPeerContext, 'verifyPassword').mockResolvedValue(true);
      component.password.set('correct');

      await component.submit();

      expect(component.help()).toBe('');
    });

    it('resolves nothing for a wrong password', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn((component as any).targetPeerContext, 'verifyPassword').mockResolvedValue(false);
      component.password.set('wrong');

      await component.submit();

      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('says the password is wrong', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn((component as any).targetPeerContext, 'verifyPassword').mockResolvedValue(false);
      component.password.set('wrong');

      await component.submit();

      expect(component.help()).toBe('パスワードが違います');
    });
  });

  describe('checking the password against the peer it was given', () => {
    it('takes the right password and turns the wrong one away for a room made the usual way', async () => {
      const room = await PeerContext.createRoom('user', 'a1', 'マイルーム', 'secret');
      setModalOption(modalService, {
        peerContext: room,
        title: 'マイルーム/a1',
      });
      const probe = TestBed.createComponent(PasswordCheckComponent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const target = (probe.componentInstance as any).targetPeerContext as PeerContext;

      expect(target.roomName).toBe('マイルーム');
      expect(await target.verifyPassword('secret')).toBe(true);
      expect(await target.verifyPassword('wrong')).toBe(false);
    });
  });

  it('takes the password down as typed for a room server, which checks it itself', async () => {
    setModalOption(modalService, { checkedByServer: true, title: 'Room' });
    const component = TestBed.createComponent(PasswordCheckComponent).componentInstance;
    const resolve = vi.spyOn(modalService, 'resolve').mockImplementation(() => {});

    component.onPasswordChange('anything');
    await component.submit();

    expect(resolve).toHaveBeenCalledWith('anything');
  });
});
