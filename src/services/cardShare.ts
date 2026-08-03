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

/**
 * System share sheet. Returns true when the image actually went somewhere we
 * can tell — a cancel is NOT an error and must not raise an alert, because
 * react-native-share reports a dismissal the same way it reports a failure.
 */
export async function shareCard(node: unknown, dialogTitle?: string): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const uri = await captureCard(node);
    await Sharing.shareAsync(uri, { mimeType: CAPTURE_MIME, dialogTitle });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|dismiss/i.test(msg)) return false;
    return false;
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
 * app — the manifest entry is actively stripped in
 * plugins/withRemoveMediaPermissions.js. Do not add a permission request here.
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
    Alert.alert(strings.failTitle, e instanceof Error ? e.message : strings.tryAgain);
    return false;
  }
}
