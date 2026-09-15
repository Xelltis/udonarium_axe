const types = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  pjpeg: 'image/jpeg',
  pjp: 'image/jpeg',
  png: 'image/png',
  apng: 'image/apng',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  svgz: 'image/svg+xml',
  ico: 'image/x-icon',
  cur: 'image/x-icon',
  bmp: 'image/bmp',
  html: 'text/html',
  htm: 'text/html',
  shtml: 'text/html',
  xml: 'text/xml',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  json: 'application/json',
  map: 'application/json',
  zip: 'application/zip',
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  m4a: 'audio/aac',
  ogg: 'audio/ogg',
  mpg: 'video/mpeg',
  mpeg: 'video/mpeg',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

/**
 * The MIME type for a file name or URL by its extension, or an empty string when the
 * extension is not one the app knows.
 */
export function type(fileName: string): string {
  const ext = fileName.replace(/.*[./\\]/, '').toLowerCase();
  return (types as Record<string, string>)[ext] ? (types as Record<string, string>)[ext] : '';
}

/**
 * The file extension for a MIME type, the first listed where several share it; an
 * unknown type gives its subtype.
 */
export function extension(mimeType: string): string {
  for (const [key, value] of Object.entries(types as Record<string, string>)) {
    if (value === mimeType) return key;
  }
  return mimeType.split('/')[1];
}
