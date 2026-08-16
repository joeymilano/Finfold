const MEDIA_BUCKET_PUBLIC_MARKER = "/storage/v1/object/public/media/";

/**
 * Return the storage object path only when the URL belongs to Finfold's public
 * media bucket and is scoped to the current user. Stock-library cache URLs and
 * another user's uploads must never be removed with a content kit.
 */
export function getOwnedMediaStoragePath(url: string | undefined, userId: string): string | null {
  if (!url) return null;

  try {
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(MEDIA_BUCKET_PUBLIC_MARKER);
    if (markerIndex < 0) return null;

    const encodedPath = pathname.slice(markerIndex + MEDIA_BUCKET_PUBLIC_MARKER.length);
    const storagePath = decodeURIComponent(encodedPath);
    return storagePath.startsWith(`${userId}/`) ? storagePath : null;
  } catch {
    return null;
  }
}

export function collectOwnedMediaStoragePaths(urls: Array<string | undefined>, userId: string): string[] {
  const paths = urls
    .map((url) => getOwnedMediaStoragePath(url, userId))
    .filter((path): path is string => Boolean(path));

  return Array.from(new Set(paths));
}
