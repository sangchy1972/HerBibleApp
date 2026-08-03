import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

// Share / save for mystery cards.
//
// Extracted rather than copied into each screen because the draw overlay, the
// collection detail and (later) anything else that shows a card all need the
// identical pipeline, and the permission subtlety below is the kind of thing
// that gets lost in a copy-paste.

/** Same as ShareVerseSheet — jpg at 0.8 is the app's capture setting. */
const CAPTURE_FORMAT = 'jpg' as const;
const CAPTURE_QUALITY = 0.8;
const CAPTURE_MIME = 'image/jpeg';

/** Capture an off-screen node to a temp file. */
export async function captureCard(node: unknown): Promise<string> {
  const uri = await captureRef(node as never, {
    format: CAPTURE_FORMAT,
    quality: CAPTURE_QUALITY,
    result: 'tmpfile',
  });
  return uri.startsWith('file://') ? uri : `file://${uri}`;
}

export type ShareResult = 'shared' | 'cancelled' | 'unavailable' | 'failed';

/**
 * System share sheet.
 *
 * The distinction between the outcomes matters to the caller: `cancelled` is
 * her changing her mind and must stay silent, while `unavailable` and `failed`
 * are the app doing nothing and MUST say so — otherwise she taps share, the
 * screen does not move, and there is no way to tell whether it worked.
 *
 * expo-sharing reports "no provider" by returning false from isAvailableAsync,
 * and a dismissal as a thrown error indistinguishable from a real failure
 * except by its message.
 */
export async function shareCard(node: unknown, dialogTitle?: string): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const uri = await captureCard(node);
    await Sharing.shareAsync(uri, { mimeType: CAPTURE_MIME, dialogTitle });
    return 'shared';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return /cancel|dismiss/i.test(msg) ? 'cancelled' : 'failed';
  }
}

/**
 * Save to the photo library.
 *
 * ⚠️ NO PERMISSION REQUEST, deliberately. `saveToLibraryAsync` writes through
 * Android's MediaStore, which needs no read permission on Android 10+, and on
 * iOS triggers the add-only Photos prompt backed by NSPhotoLibraryAddUsageDescription.
 *
 * Requesting READ_MEDIA_IMAGES is what a naive implementation does, and Google
 * Play's Photo & Video Permissions policy rejects it as non-core for a Bible
 * app — the manifest entry is actively stripped by android.blockedPermissions
 * in app.json (there is no withRemoveMediaPermissions plugin; that name was
 * wrong). Do not add a permission request here.
 */
export async function saveCard(
  node: unknown,
  onOk: () => void,
  strings: { failTitle: string; tryAgain: string },
): Promise<boolean> {
  try {
    const uri = await captureCard(node);
    await MediaLibrary.saveToLibraryAsync(uri);
    onOk();
    return true;
  } catch (e) {
    // NEVER e.message. The platform's own text here is untranslated English
    // ("The operation couldn't be completed…"), and putting it in front of her
    // reads as the app breaking rather than as one save not working.
    Alert.alert(strings.failTitle, strings.tryAgain);
    return false;
  }
}
