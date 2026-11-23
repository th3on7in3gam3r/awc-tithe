/** Compare the running bundle with the build served on the current app origin. */
export async function fetchBuildUpdate(
  currentBuild: string,
  baseUrl: string,
  signal: AbortSignal,
  fetchVersion = fetch,
): Promise<string | null> {
  const url = new URL('build-version.json', baseUrl);
  // Bypass both browser and intermediary caches.
  url.searchParams.set('check', String(Date.now()));
  const response = await fetchVersion(url, { cache: 'no-store', signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return null;
  const version: unknown = (await response.json())?.version;
  return typeof version === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(version) && version !== currentBuild
    ? version
    : null;
}

export function buildRefreshUrl(currentUrl: string, build: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set('awcBuild', build);
  return url.href;
}
