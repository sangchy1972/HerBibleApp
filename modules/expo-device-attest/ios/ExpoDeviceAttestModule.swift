import DeviceCheck
import ExpoModulesCore

// Thin wrapper around DCAppAttestService. The JS layer is responsible for
// computing the clientDataHash (= SHA256 of the server-issued challenge) and
// passing it in as a base64 string. We never log the keyId or the attestation
// payload — they're device-scoped secrets.

public class ExpoDeviceAttestModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoDeviceAttest")

    Function("isSupported") { () -> Bool in
      return DCAppAttestService.shared.isSupported
    }

    AsyncFunction("generateKey") { (promise: Promise) in
      DCAppAttestService.shared.generateKey { keyId, error in
        if let error = error {
          promise.reject("APP_ATTEST_GENERATE_KEY", error.localizedDescription)
          return
        }
        guard let keyId = keyId else {
          promise.reject("APP_ATTEST_GENERATE_KEY", "DCAppAttestService returned a nil keyId")
          return
        }
        promise.resolve(keyId)
      }
    }

    AsyncFunction("attestKey") { (keyId: String, clientDataHashB64: String, promise: Promise) in
      guard let hash = Data(base64Encoded: clientDataHashB64) else {
        promise.reject("BAD_HASH", "clientDataHash must be base64")
        return
      }
      DCAppAttestService.shared.attestKey(keyId, clientDataHash: hash) { attestation, error in
        if let error = error {
          promise.reject("APP_ATTEST_ATTEST_KEY", error.localizedDescription)
          return
        }
        guard let attestation = attestation else {
          promise.reject("APP_ATTEST_ATTEST_KEY", "attestKey returned a nil attestation")
          return
        }
        promise.resolve(attestation.base64EncodedString())
      }
    }

    AsyncFunction("generateAssertion") { (keyId: String, clientDataHashB64: String, promise: Promise) in
      guard let hash = Data(base64Encoded: clientDataHashB64) else {
        promise.reject("BAD_HASH", "clientDataHash must be base64")
        return
      }
      DCAppAttestService.shared.generateAssertion(keyId, clientDataHash: hash) { assertion, error in
        if let error = error {
          promise.reject("APP_ATTEST_GENERATE_ASSERTION", error.localizedDescription)
          return
        }
        guard let assertion = assertion else {
          promise.reject("APP_ATTEST_GENERATE_ASSERTION", "generateAssertion returned a nil assertion")
          return
        }
        promise.resolve(assertion.base64EncodedString())
      }
    }
  }
}
