import CryptoKit
import Foundation

public enum WebhookVerificationError: Error, Equatable, Sendable {
    case missingHeaders
    case invalidTimestamp
    case timestampOutOfRange
    case noMatchingSignature
}

/// Standard Webhooks (https://www.standardwebhooks.com) receiver for Flux and Little Black Box deliveries:
/// `webhook-id`, `webhook-timestamp` (unix seconds) and `webhook-signature` (space-separated
/// `v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>`), key = base64-decode of the secret after
/// `whsec_` (raw UTF-8 bytes when that tail is not valid base64, as LBB's server does).
public struct WebhookVerifier: Sendable {
    public let secret: String
    public let tolerance: TimeInterval

    public init(secret: String, tolerance: TimeInterval = 300) {
        self.secret = secret
        self.tolerance = tolerance
    }

    public static func signingKey(secret: String) -> SymmetricKey {
        let tail = secret.hasPrefix("whsec_") ? String(secret.dropFirst(6)) : secret
        if let data = Data(base64Encoded: tail), !data.isEmpty { return SymmetricKey(data: data) }
        return SymmetricKey(data: Data(secret.utf8))
    }

    private static func message(id: String, timestamp: String, payload: Data) -> Data {
        var m = Data("\(id).\(timestamp).".utf8)
        m.append(payload)
        return m
    }

    /// `v1,<base64>` for a message (for testing your own receiver).
    public static func sign(secret: String, id: String, timestamp: Int, payload: Data) -> String {
        let mac = HMAC<SHA256>.authenticationCode(for: message(id: id, timestamp: String(timestamp), payload: payload), using: signingKey(secret: secret))
        return "v1," + Data(mac).base64EncodedString()
    }

    /// Verifies the RAW body against the headers (names matched case-insensitively). Returns the body.
    @discardableResult
    public func verify(payload: Data, headers: [String: String], now: Date = Date()) throws -> Data {
        func header(_ name: String) -> String? { headers.first { $0.key.lowercased() == name }?.value }
        guard let id = header("webhook-id"), let ts = header("webhook-timestamp"), let sigs = header("webhook-signature"),
              !id.isEmpty, !ts.isEmpty, !sigs.isEmpty else { throw WebhookVerificationError.missingHeaders }
        guard ts.count <= 12, ts.allSatisfy({ $0.isASCII && $0.isNumber }), let seconds = Double(ts) else { throw WebhookVerificationError.invalidTimestamp }
        guard abs(now.timeIntervalSince1970 - seconds) <= tolerance else { throw WebhookVerificationError.timestampOutOfRange }
        let key = Self.signingKey(secret: secret)
        let signed = Self.message(id: id, timestamp: ts, payload: payload)
        var ok = false
        for part in sigs.split(separator: " ") {
            let pieces = part.split(separator: ",", maxSplits: 1)
            guard pieces.count == 2, pieces[0] == "v1", let given = Data(base64Encoded: String(pieces[1])) else { continue }
            // CryptoKit's comparison is constant-time; keep looping so timing does not reveal which one matched.
            if HMAC<SHA256>.isValidAuthenticationCode(given, authenticating: signed, using: key) { ok = true }
        }
        guard ok else { throw WebhookVerificationError.noMatchingSignature }
        return payload
    }

    /// Verifies, then decodes the body.
    public func verify<T: Decodable>(_ type: T.Type, payload: Data, headers: [String: String], now: Date = Date()) throws -> T {
        try JSONDecoder().decode(T.self, from: verify(payload: payload, headers: headers, now: now))
    }
}
