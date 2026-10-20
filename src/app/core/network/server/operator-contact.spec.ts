import { operatorContactText, readOperatorContact } from '@axe/core/network/server/operator-contact';

describe('the room server operator’s contact', () => {
  it.each(['https://example.com/contact', 'mailto:admin@example.com'])('is taken as %s', (contact) => {
    expect(readOperatorContact(contact)).toBe(contact);
  });

  it.each([
    ['a script', 'javascript:alert(1)'],
    ['a plain page', 'http://example.com'],
    ['data', 'data:text/html,hi'],
    ['words', 'write to the operator'],
    ['nothing', ''],
    ['no text', 3],
    ['none', null],
    ['too long', `https://example.com/${'a'.repeat(2048)}`],
  ])('is left out for %s', (_label, contact) => {
    expect(readOperatorContact(contact)).toBeNull();
  });

  it('reads a mail address without its scheme, and a page as it is', () => {
    expect(operatorContactText('mailto:admin@example.com?subject=ban')).toBe('admin@example.com');
    expect(operatorContactText('https://example.com/contact')).toBe('https://example.com/contact');
  });
});
