/**
 * The red, green and blue of a hex colour, each from 0 to 255: three, six or eight digits, with or
 * without the `#`, where the last two of eight are its opacity and are left out. Null where the
 * colour is not written in hex.
 */
export function hexChannels(color: string): [number, number, number] | null {
  const digits = color.trim().replace(/^#/, '');
  const full =
    digits.length === 3
      ? digits.replace(/./g, '$&$&')
      : digits.length === 6 || digits.length === 8
        ? digits.slice(0, 6)
        : null;
  if (!full || !/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** A hex colour as `rgba()` at an opacity; a colour written any other way comes back as it was given. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = hexChannels(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : color;
}
