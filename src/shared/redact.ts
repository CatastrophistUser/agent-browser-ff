const SENSITIVE = /(token|key|code|session|auth|secret|password|passwd|sig|bearer|jwt)/i;

/** Redact sensitive query-string values in a URL so it is safe to log or print. */
export function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    let changed = false;
    for (const k of [...url.searchParams.keys()]) {
      if (SENSITIVE.test(k)) { url.searchParams.set(k, 'REDACTED'); changed = true; }
    }
    if (url.username || url.password) { url.username = ''; url.password = ''; changed = true; }
    return changed ? url.toString() : u;
  } catch { return u; }
}

/** Remove any occurrence of the given secrets from a string. */
export function scrubSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join('[REDACTED]');
  return out;
}
