import {
  forgetSealedFace,
  keepSealedFace,
  MOST_SEALED_FACES,
  onSealedFacesChangedElsewhere,
  rereadSealedFaces,
  sealedFaceOf,
} from '@axe/core/storage/sealed-faces';
import { refuseLocalStorage } from '@axe/testing/refused-storage';

describe('sealed faces', () => {
  beforeEach(() => {
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
  });

  it('keeps the face of a die and gives it back, and none for a die it keeps nothing of', () => {
    keepSealedFace('die-a', '4');

    expect(sealedFaceOf('die-a')).toBe('4');
    expect(sealedFaceOf('die-b')).toBeNull();
  });

  it('still has it once the page is loaded anew', () => {
    keepSealedFace('die-a', '4');

    rereadSealedFaces();

    expect(sealedFaceOf('die-a')).toBe('4');
  });

  it('lets go of a face it is told to forget, for good', () => {
    keepSealedFace('die-a', '4');
    forgetSealedFace('die-a');
    rereadSealedFaces();

    expect(sealedFaceOf('die-a')).toBeNull();
    expect(localStorage.getItem('axe-sealed-dice-faces')).toBeNull();
  });

  it('keeps only as many as it may, letting the oldest go', () => {
    for (let i = 0; i <= MOST_SEALED_FACES; i++) keepSealedFace(`die-${i}`, '1');
    keepSealedFace('die-1', '6');
    rereadSealedFaces();

    expect(sealedFaceOf('die-0')).toBeNull();
    expect(sealedFaceOf('die-1')).toBe('6');
    expect(sealedFaceOf(`die-${MOST_SEALED_FACES}`)).toBe('1');
  });

  it('reads what it cannot make sense of as nothing kept', () => {
    localStorage.setItem('axe-sealed-dice-faces', '{"die-a": 4, "die-b": "2"');
    rereadSealedFaces();

    expect(sealedFaceOf('die-a')).toBeNull();
    expect(sealedFaceOf('die-b')).toBeNull();
  });

  it('holds the faces while the page is open where the browser refuses to keep them', () => {
    refuseLocalStorage();
    rereadSealedFaces();

    keepSealedFace('die-a', '3');
    keepSealedFace('die-b', '5');

    expect([sealedFaceOf('die-a'), sealedFaceOf('die-b')]).toEqual(['3', '5']);
  });

  it('tells of the dice whose faces another tab changed from what was read here, and of none it left alone', () => {
    keepSealedFace('die-a', '3');
    keepSealedFace('die-b', '4');
    sealedFaceOf('die-a');
    const told: (readonly string[])[] = [];
    const stop = onSealedFacesChangedElsewhere((identifiers) => told.push(identifiers));

    localStorage.setItem('axe-sealed-dice-faces', JSON.stringify({ 'die-a': '6', 'die-b': '4', 'die-c': '1' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'axe-sealed-dice-faces' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'another-key' }));
    stop();
    localStorage.setItem('axe-sealed-dice-faces', JSON.stringify({ 'die-a': '1' }));
    sealedFaceOf('die-a');
    window.dispatchEvent(new StorageEvent('storage', { key: 'axe-sealed-dice-faces' }));

    expect(told).toEqual([['die-a', 'die-c']]);
  });

  it('goes on holding what the browser refused to keep, as another tab writes what it keeps', () => {
    const shared = localStorage;
    const refuse = () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
    vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({
      getItem: (key: string) => shared.getItem(key),
      setItem: refuse,
      removeItem: refuse,
    } as unknown as Storage);
    keepSealedFace('die-a', '3');

    shared.setItem('axe-sealed-dice-faces', JSON.stringify({ 'die-b': '6' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'axe-sealed-dice-faces' }));

    expect([sealedFaceOf('die-a'), sealedFaceOf('die-b')]).toEqual(['3', '6']);
  });

  it('keeps what another tab kept when it keeps one of its own, and reads it as the other tab writes it', () => {
    keepSealedFace('die-a', '3');
    localStorage.setItem('axe-sealed-dice-faces', JSON.stringify({ 'die-a': '3', 'die-b': '6' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'axe-sealed-dice-faces' }));
    expect(sealedFaceOf('die-b')).toBe('6');

    localStorage.setItem('axe-sealed-dice-faces', JSON.stringify({ 'die-a': '3', 'die-b': '6', 'die-c': '1' }));
    keepSealedFace('die-d', '2');

    expect(JSON.parse(localStorage.getItem('axe-sealed-dice-faces')!)).toEqual({
      'die-a': '3',
      'die-b': '6',
      'die-c': '1',
      'die-d': '2',
    });
  });
});
