const configuredMediaBase = import.meta.env?.VITE_MEDIA_BASE_URL ?? '';

export function mediaUrl(path, { localPath = path, base = configuredMediaBase } = {}) {
  const normalizedBase = String(base ?? '').replace(/\/+$/, '');
  const selectedPath = normalizedBase ? path : localPath;
  const normalizedPath = `/${String(selectedPath).replace(/^\/+/, '')}`;
  return `${normalizedBase}${normalizedPath}`;
}
