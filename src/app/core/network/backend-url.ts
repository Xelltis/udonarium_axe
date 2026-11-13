/**
 * The room server's address out of the app config, under `backend.url`; empty where the config has
 * none, or holds something other than a string there.
 */
export function readBackendUrl(config: unknown): string {
  if (config === null || typeof config !== 'object') return '';
  const backend = (config as { backend?: unknown }).backend;
  if (backend === null || typeof backend !== 'object') return '';
  const url = (backend as { url?: unknown }).url;
  return typeof url === 'string' ? url : '';
}
