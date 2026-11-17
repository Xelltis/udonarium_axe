import { isLoopbackHost } from './loopback';

describe('isLoopbackHost', () => {
  it('takes this computer’s own names, with or without a port, IPv6 in brackets', () => {
    for (const host of ['127.0.0.1:47610', 'localhost', 'LOCALHOST:80', '[::1]:47610', '::1']) {
      expect(isLoopbackHost(host), host).toBe(true);
    }
  });

  it('turns away any other name, and a request with none', () => {
    for (const host of ['attacker.example', 'attacker.example:47610', '127.0.0.2', '', undefined]) {
      expect(isLoopbackHost(host), String(host)).toBe(false);
    }
  });
});
