import AppTapTapCore
import Foundation
import XCTest

/// Same vectors as the TypeScript tests: ../vectors/webhooks.json (vectors/generate.mjs, node:crypto).
struct Vector: Decodable {
    let name: String, secret: String, id: String, timestamp: Int, body: String, signature: String
    var headers: [String: String] { ["webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": signature] }
    var now: Date { Date(timeIntervalSince1970: TimeInterval(timestamp)) }
}

func loadVectors() throws -> [Vector] {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    struct File: Decodable { let vectors: [Vector] }
    return try JSONDecoder().decode(File.self, from: Data(contentsOf: root.appendingPathComponent("vectors/webhooks.json"))).vectors
}

final class WebhookVerifierTests: XCTestCase {
    func testAllSharedVectorsSignAndVerify() throws {
        let vectors = try loadVectors()
        XCTAssertEqual(vectors.count, 5)
        for v in vectors {
            XCTAssertEqual(WebhookVerifier.sign(secret: v.secret, id: v.id, timestamp: v.timestamp, payload: Data(v.body.utf8)), v.signature, v.name)
            XCTAssertNoThrow(try WebhookVerifier(secret: v.secret).verify(payload: Data(v.body.utf8), headers: v.headers, now: v.now), v.name)
        }
    }

    func testStandardWebhooksReferenceVectorIsTheServerTestsValue() throws {
        let v = try XCTUnwrap(try loadVectors().first)
        XCTAssertEqual(v.signature, "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=")
    }

    func testRejections() throws {
        let v = try loadVectors()[1]
        let verifier = WebhookVerifier(secret: v.secret)
        let body = Data(v.body.utf8)
        XCTAssertThrowsError(try verifier.verify(payload: Data((v.body + " ").utf8), headers: v.headers, now: v.now)) {
            XCTAssertEqual($0 as? WebhookVerificationError, .noMatchingSignature)
        }
        XCTAssertThrowsError(try WebhookVerifier(secret: "whsec_AbCdEfGhIjKlMnOpQrStUvWxYz012345").verify(payload: body, headers: v.headers, now: v.now)) {
            XCTAssertEqual($0 as? WebhookVerificationError, .noMatchingSignature)
        }
        XCTAssertThrowsError(try verifier.verify(payload: body, headers: ["webhook-id": v.id], now: v.now)) {
            XCTAssertEqual($0 as? WebhookVerificationError, .missingHeaders)
        }
        var bad = v.headers; bad["webhook-timestamp"] = "soon"
        XCTAssertThrowsError(try verifier.verify(payload: body, headers: bad, now: v.now)) {
            XCTAssertEqual($0 as? WebhookVerificationError, .invalidTimestamp)
        }
        var v2 = v.headers; v2["webhook-signature"] = v.signature.replacingOccurrences(of: "v1,", with: "v2,")
        XCTAssertThrowsError(try verifier.verify(payload: body, headers: v2, now: v.now))
    }

    func testFiveMinuteToleranceBothWays() throws {
        let v = try loadVectors()[1]
        let verifier = WebhookVerifier(secret: v.secret)
        let body = Data(v.body.utf8)
        XCTAssertNoThrow(try verifier.verify(payload: body, headers: v.headers, now: v.now.addingTimeInterval(300)))
        for skew in [301.0, -301.0] {
            XCTAssertThrowsError(try verifier.verify(payload: body, headers: v.headers, now: v.now.addingTimeInterval(skew))) {
                XCTAssertEqual($0 as? WebhookVerificationError, .timestampOutOfRange)
            }
        }
    }

    func testMultipleSignaturesAndCaseInsensitiveHeaders() throws {
        let v = try loadVectors()[3]
        let headers = ["Webhook-Id": v.id, "WEBHOOK-TIMESTAMP": String(v.timestamp),
                       "Webhook-Signature": "v1,\(Data(count: 32).base64EncodedString()) v2,abc \(v.signature)"]
        struct Envelope: Decodable { let id: String; let type: String; let livemode: Bool }
        let e = try WebhookVerifier(secret: v.secret).verify(Envelope.self, payload: Data(v.body.utf8), headers: headers, now: v.now)
        XCTAssertEqual(e.type, "registration.created")
        XCTAssertEqual(e.id, v.id)
        XCTAssertFalse(e.livemode)
    }
}
