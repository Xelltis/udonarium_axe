import { readBackendUrl } from '@axe/core/network/backend-url';

describe('readBackendUrl', () => {
  it('reads the url under backend', () => {
    expect(readBackendUrl({ backend: { url: 'https://rooms.example' } })).toBe('https://rooms.example');
  });

  it('is empty where the config has no backend, or the backend no url', () => {
    expect(readBackendUrl({})).toBe('');
    expect(readBackendUrl({ backend: {} })).toBe('');
    expect(readBackendUrl({ backend: null })).toBe('');
    expect(readBackendUrl({ backend: 'https://rooms.example' })).toBe('');
  });

  it('is empty where the url is not a string, or the config is not an object', () => {
    expect(readBackendUrl({ backend: { url: 42 } })).toBe('');
    expect(readBackendUrl({ backend: { url: null } })).toBe('');
    expect(readBackendUrl(null)).toBe('');
    expect(readBackendUrl(undefined)).toBe('');
  });
});
