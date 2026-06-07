// Cloudflare Access service-token headers for the plans Worker.
//
// The plans Worker is reached via its *.workers.dev host (so its dev-bypass
// fires and we don't need Play Integrity yet — see plansApi.ts). To stop anyone
// who discovers that URL from scraping the plan corpus, the host is protected by
// a Cloudflare Access "Service Auth" policy: every request must carry a valid
// service-token pair, which Cloudflare validates BEFORE the request reaches the
// Worker. Requests without it are rejected at the edge.
//
// The token values are injected at build time from EAS environment variables
// (EXPO_PUBLIC_* are inlined into the JS bundle by Expo) so they are never
// committed to git. For local dev-client testing, put them in a gitignored
// .env file at the project root.
//
//   EXPO_PUBLIC_CF_ACCESS_CLIENT_ID
//   EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET
//
// Note: like any secret shipped inside a mobile binary these are extractable by
// a determined attacker, but they raise the bar from "open to the world" to
// "needs the token", which is the goal for the interim (pre-Play-Integrity)
// hardening. Rotate the token in Cloudflare if it ever leaks.

const CLIENT_ID = process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_ID;
const CLIENT_SECRET = process.env.EXPO_PUBLIC_CF_ACCESS_CLIENT_SECRET;

// Returns the CF-Access-* headers to merge into every plans-Worker request.
// Empty (no headers) when the values aren't configured, so a misconfigured dev
// build fails closed at Cloudflare Access rather than silently leaking.
export function cfAccessHeaders(): Record<string, string> {
  if (CLIENT_ID && CLIENT_SECRET) {
    return {
      'CF-Access-Client-Id': CLIENT_ID,
      'CF-Access-Client-Secret': CLIENT_SECRET,
    };
  }
  return {};
}
