// HTMLImageElement cache for asset data-URLs. Sprites draw as soon as the
// image finishes decoding, so the editor never blocks on load.

const cache = new Map();

export function getImage(src) {
  if (!src) return null;
  let entry = cache.get(src);
  if (!entry) {
    const img = new Image();
    entry = { img, loaded: false, failed: false };
    img.onload = () => {
      entry.loaded = true;
    };
    img.onerror = () => {
      entry.failed = true;
    };
    img.src = src;
    cache.set(src, entry);
  }
  return entry;
}

export function imageReady(src) {
  const entry = getImage(src);
  return Boolean(entry && entry.loaded);
}
