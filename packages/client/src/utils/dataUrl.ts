// Content-addressed data URL helper.
// Appends ?v=<calibrationHash> so each build produces fresh URLs that
// browser/CDN cannot serve from stale cache. After this hits prod, the
// only file that needs to be bypass-cached is features_meta.json itself
// (already done via { cache: 'no-store' }); all other data files can be
// cached indefinitely because their URL changes whenever content changes.

interface Meta {
  calibrationHash?: string | null;
}

let metaPromise: Promise<Meta> | null = null;

function loadMeta(): Promise<Meta> {
  if (!metaPromise) {
    metaPromise = fetch('/data/features_meta.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return metaPromise;
}

/**
 * Returns a data URL with a `?v=<hash>` cache-busting query.
 * Hash comes from features_meta.json's calibrationHash — changes on
 * every build, so old cached responses can never be served accidentally.
 */
export async function dataUrl(path: string): Promise<string> {
  const meta = await loadMeta();
  const v = meta.calibrationHash;
  if (!v) return path; // graceful fallback if meta unavailable
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}v=${v}`;
}
