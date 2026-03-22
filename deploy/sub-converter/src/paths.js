import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

function toFileUrl(value) {
  if (!value) {
    return null;
  }

  if (value.startsWith('file://')) {
    return new URL(value);
  }

  return pathToFileURL(resolvePath(value));
}

function ensureTrailingSlash(url) {
  if (url.href.endsWith('/')) {
    return url;
  }
  return new URL(`${url.href}/`);
}

export function resolveEnvPath(envName, fallbackUrl) {
  const rawValue = process.env[envName];
  const candidate = toFileUrl(rawValue?.trim?.());
  return candidate ?? fallbackUrl;
}

export function resolveEnvDir(envName, fallbackUrl) {
  const url = resolveEnvPath(envName, fallbackUrl);
  return ensureTrailingSlash(url);
}
