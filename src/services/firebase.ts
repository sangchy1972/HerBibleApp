// Crash-safe wrapper around Firebase Analytics + Crashlytics.
//
// Every entry point is guarded so that on a build where the native Firebase
// module ISN'T compiled in yet (e.g. the current dev client, or any build made
// before google-services.json + the @react-native-firebase plugins were added)
// these calls degrade to a silent no-op instead of throwing at startup. Once a
// native build that includes Firebase ships, the same calls light up for real.
// This mirrors the defensive `requireOptionalNativeModule` pattern already used
// for expo-network in TranslationsContext.

let analyticsMod: any = null;
let crashlyticsMod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  analyticsMod = require('@react-native-firebase/analytics').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  crashlyticsMod = require('@react-native-firebase/crashlytics').default;
} catch {
  // Native module not present in this binary — leave both null (no-op mode).
}

export const isFirebaseAvailable = (): boolean => !!analyticsMod;

// Enable collection explicitly (both default to on, but being explicit makes
// the intent auditable and lets us flip a kill-switch here later if needed).
export async function initFirebase(): Promise<void> {
  try { if (crashlyticsMod) await crashlyticsMod().setCrashlyticsCollectionEnabled(true); } catch {}
  try { if (analyticsMod) await analyticsMod().setAnalyticsCollectionEnabled(true); } catch {}
}

// Custom analytics event. Safe to call from anywhere; never throws.
export async function logEvent(name: string, params?: Record<string, unknown>): Promise<void> {
  try { if (analyticsMod) await analyticsMod().logEvent(name, params as any); } catch {}
}

// Screen-view event — call on navigation focus to populate the funnel.
export async function logScreenView(screen: string): Promise<void> {
  try {
    if (analyticsMod) await analyticsMod().logScreenView({ screen_name: screen, screen_class: screen });
  } catch {}
}

// Durable user properties — set ONCE, then Firebase attaches them to every
// subsequent event for that user. Ideal for cohort/segmentation analysis in
// BigQuery (e.g. retention by time_commitment, conversion by goal). Property
// names ≤24 chars; string values ≤36 chars. Pass null to clear one.
export async function setUserProps(props: Record<string, string | null>): Promise<void> {
  try { if (analyticsMod) await analyticsMod().setUserProperties(props); } catch {}
}

// Tie events to a signed-in user (Firebase Auth UID). Pass null on sign-out.
export async function setAnalyticsUser(uid: string | null): Promise<void> {
  try {
    if (analyticsMod) await analyticsMod().setUserId(uid);
    if (crashlyticsMod && uid) crashlyticsMod().setUserId(uid);
  } catch {}
}

// Non-fatal error reporting to Crashlytics.
export function recordError(err: unknown, context?: string): void {
  try {
    if (!crashlyticsMod) return;
    if (context) crashlyticsMod().log(context);
    crashlyticsMod().recordError(err instanceof Error ? err : new Error(String(err)));
  } catch {}
}

// Stamp the CURRENT SCREEN onto every future crash report (custom key +
// breadcrumb log). Added for the 2026-08-13 Crashlytics batch: the two Fabric
// races there (SurfaceMountingManager viewState / NativeAnimated
// connectAnimatedNodes) are RN-internal and their stacks contain not one app
// frame, so "which screen was she on" is the only attribution we can give the
// NEXT occurrence. Cheap (one native call per real navigation), and fed from
// the same App.tsx hook that already logs screen_view.
export function setCrashScreen(screen: string): void {
  try {
    if (!crashlyticsMod) return;
    crashlyticsMod().setAttribute('last_screen', screen);
    crashlyticsMod().log(`screen: ${screen}`);
  } catch {}
}
