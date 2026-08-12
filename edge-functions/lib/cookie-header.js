// Standard Set-Cookie header serialization.
//
// EdgeOne's `response.setCookies(cookies)` (Cookies API write-side) is
// deprecated on this runtime (confirmed via local `edgeone makers dev`:
// "Failed to execute 'setCookies' on 'Response': it is deprecated, please
// consider using 'Headers' for replacement."). This helper builds a
// standard Set-Cookie string appended via response.headers.append(), which
// works on both the documented Cookies API era and the current
// Headers-based runtime. Reading incoming cookies via
// `new Cookies(request.headers.get('Cookie'))` is unaffected — only the
// response write-side API changed.
export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];

  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  if (options.httpOnly) parts.push('HttpOnly');

  return parts.join('; ');
}

// Set-Cookie with Max-Age=0 clears the cookie (standard removal pattern).
export function serializeCookieRemoval(name, options = {}) {
  return serializeCookie(name, '', { ...options, maxAge: 0 });
}
