export function isAllowedOrigin(origin?: string, phoneOrigin?: string) {
  if (!origin || /^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
    return true;
  // Only the exact HTTPS origin explicitly enabled by the developer is accepted.
  // The API still binds to loopback and is reached through Vite's /api proxy.
  return Boolean(phoneOrigin?.startsWith("https://") && origin === phoneOrigin);
}
