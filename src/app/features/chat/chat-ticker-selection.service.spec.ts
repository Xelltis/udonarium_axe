import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import {
  CHAT_TICKER_SELECTION_EVENT_NAME,
  ChatTickerSelectionEvent,
  ChatTickerSelectionService,
} from '@axe/features/chat/chat-ticker-selection.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatTickerSelectionService', () => {
  let service: ChatTickerSelectionService;
  let shown: ChatTickerSelectionEvent[];
  let stop: () => void;

  function arrive(eventName: string, data: unknown): void {
    networkMessage$.emit({ eventName, data, sendFrom: 'somebody', isSendFromSelf: false });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatTickerSelectionService);
    shown = [];
    stop = service.selection$.subscribe((event) => shown.push(event));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    stop();
  });

  it('tells of a line somebody asked every ticker to show', () => {
    arrive(CHAT_TICKER_SELECTION_EVENT_NAME, { messageIdentifier: 'line-1' });

    expect(shown).toEqual([{ messageIdentifier: 'line-1' }]);
  });

  it('tells of nothing for another event, or for one that names no line', () => {
    arrive('SOMETHING_ELSE', { messageIdentifier: 'line-1' });
    arrive(CHAT_TICKER_SELECTION_EVENT_NAME, { messageIdentifier: '' });
    arrive(CHAT_TICKER_SELECTION_EVENT_NAME, { messageIdentifier: 7 });
    arrive(CHAT_TICKER_SELECTION_EVENT_NAME, null);

    expect(shown).toEqual([]);
  });

  it('asks every ticker in the room to show a line', () => {
    const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => undefined as never);

    service.showMessage('line-2');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(
      expect.objectContaining({ eventName: CHAT_TICKER_SELECTION_EVENT_NAME, data: { messageIdentifier: 'line-2' } })
    );
    expect(send.mock.calls[0][1]).toBeUndefined();
  });

  it('asks for nothing with no line to show', () => {
    const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => undefined as never);

    service.showMessage('');

    expect(send).not.toHaveBeenCalled();
  });
});
