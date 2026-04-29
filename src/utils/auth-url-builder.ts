import type { InternalAuth } from '../types/config.js';

export function buildAuthUrl(
  baseUrl: string,
  auth?: InternalAuth
): string {
  if (!auth || auth.method === 'ssh') {
    return baseUrl;
  }
  
  const hasCredentials = auth.token || (auth.username && auth.password);
  if (!hasCredentials) {
    return baseUrl;
  }
  
  if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://')) {
    return baseUrl;
  }
  
  const urlObj = new URL(baseUrl);
  
  if (auth.token) {
    urlObj.username = auth.username || 'git';
    urlObj.password = auth.token;
  } else if (auth.username && auth.password) {
    urlObj.username = auth.username;
    urlObj.password = auth.password;
  }
  
  return urlObj.toString();
}

export function stripAuthFromUrl(url: string): string {
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    return url;
  }
  
  try {
    const urlObj = new URL(url);
    urlObj.username = '';
    urlObj.password = '';
    return urlObj.toString();
  } catch {
    return url;
  }
}

export function isSshUrl(url: string): boolean {
  return url.startsWith('git@');
}

export function isHttpsUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}