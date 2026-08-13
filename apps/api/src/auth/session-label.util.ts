/**
 * A best-effort, dependency-free "Browser on OS" label for a session list —
 * not a full user-agent parser (that's a much bigger dependency than this
 * cosmetic purpose justifies). Falls back to `null` for anything
 * unrecognized; the raw `userAgent` string is always stored alongside it
 * for cases where the heuristic guesses wrong.
 */
export function describeUserAgent(userAgent: string | undefined | null): string | null {
  if (!userAgent) return null;

  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Mac OS X/.test(userAgent)
      ? 'macOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /iPhone|iPad/.test(userAgent)
          ? 'iOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;

  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
          ? 'Safari'
          : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return null;
}
