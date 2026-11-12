/** Fixed server-only diagnostic categories. NEVER log provider response bodies,
 * email addresses, passwords, OTP, cookies, user IDs, IPs or arbitrary messages. */
const buckets={
  INVALID_EMAIL_OR_PASSWORD:'credential-rejected',
  INVALID_CREDENTIALS:'credential-rejected',
  INVALID_PASSWORD:'credential-rejected',
  EMAIL_NOT_VERIFIED:'verification-required',
  TOO_MANY_REQUESTS:'rate-limited',
} as const;
export function classifyAuthDenial(body:unknown):string{
  if(!body||typeof body!=='object'||Array.isArray(body))return 'unknown';
  const code=(body as Record<string,unknown>).code;
  if(typeof code!=='string'||!Object.hasOwn(buckets,code))return 'unknown';
  return buckets[code as keyof typeof buckets];
}
