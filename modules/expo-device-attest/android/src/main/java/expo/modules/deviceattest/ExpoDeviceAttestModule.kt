package expo.modules.deviceattest

import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Wraps Google Play Integrity (classic). The standard-integrity API is more
 * efficient but uses `requestHash` instead of a raw nonce, which makes the
 * server-side flow different; classic gives us a clean nonce-in / token-out
 * surface that mirrors App Attest.
 *
 * The Cloud Project Number comes from the GCP console where the package is
 * registered for Play Integrity. JS passes it across the bridge each call so we
 * don't bake any build-time secrets into the module.
 */
class ExpoDeviceAttestModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoDeviceAttest")

    AsyncFunction("isPlayIntegrityAvailable") { promise: Promise ->
      // Best-effort: IntegrityManagerFactory.create never throws on a device
      // that has Google Play Services. Real availability is gated by the
      // request itself, so we always return true here and let the caller
      // surface a failure if the actual request errors.
      promise.resolve(true)
    }

    AsyncFunction("requestPlayIntegrityToken") { nonceB64u: String, cloudProjectNumber: Double, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "no Android context", null)
        return@AsyncFunction
      }
      try {
        val manager = IntegrityManagerFactory.create(context)
        val request = IntegrityTokenRequest.builder()
          .setNonce(nonceB64u)
          .setCloudProjectNumber(cloudProjectNumber.toLong())
          .build()
        manager.requestIntegrityToken(request)
          .addOnSuccessListener { response -> promise.resolve(response.token()) }
          .addOnFailureListener { e -> promise.reject("PLAY_INTEGRITY", e.message ?: "request failed", e) }
      } catch (e: Throwable) {
        promise.reject("PLAY_INTEGRITY_INIT", e.message ?: "init failed", e)
      }
    }
  }
}
