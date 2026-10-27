import AppTapTapCore
import FluxKit
import Foundation
import XCTest

final class FluxMock: HTTPTransport, @unchecked Sendable {
    var requests: [URLRequest] = []
    let status: Int, body: String
    init(_ status: Int, _ body: String) { self.status = status; self.body = body }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

final class FluxKitTests: XCTestCase {
    func testCreateEmbedSession() async throws {
        let t = FluxMock(201, #"{"embed_token":"flux_et_test_abc","expires_at":"2026-10-27T00:10:00Z","event_id":"E1","mode":"test"}"#)
        let client = FluxClient(secretKey: "flux_sk_test_1", transport: t)
        let s = try await client.createEmbedSession(eventId: "E1", allowedOrigin: "https://app.example.com", embeddedData: ["firstName": "Ada"],
                                                    locked: ["email"], idempotencyKey: "idem")
        XCTAssertEqual(s.embedToken, "flux_et_test_abc")
        XCTAssertEqual(s.mode, "test")
        let r = try XCTUnwrap(t.requests.first)
        XCTAssertEqual(r.url?.absoluteString, "https://apptaptap-vapor-backend.fly.dev/api/flux/v1/embed/sessions")
        XCTAssertEqual(r.httpMethod, "POST")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer flux_sk_test_1")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Idempotency-Key"), "idem")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(r.httpBody)) as? [String: Any])
        XCTAssertEqual(body["event"] as? String, "E1")
        XCTAssertEqual(body["allowed_origin"] as? String, "https://app.example.com")
        XCTAssertEqual((body["embedded_data"] as? [String: String])?["firstName"], "Ada") // dictionary keys untouched
        XCTAssertEqual(body["locked"] as? [String], ["email"])
        XCTAssertNil(body["external_ref"])
    }

    func testRegisterPaymentRequiredBecomesCheckout() async throws {
        let t = FluxMock(409, #"{"error":"payment_required","message":"Buy a ticket.","checkout_url":"https://flux.events/e/E1/checkout?tier=T"}"#)
        let outcome = try await FluxClient(secretKey: "flux_sk_live_1", transport: t)
            .register(eventId: "E1", FluxRegisterRequest(name: "Ada", email: "a@example.com", tierId: "T"))
        XCTAssertEqual(outcome, .paymentRequired(checkoutURL: URL(string: "https://flux.events/e/E1/checkout?tier=T")!))
        let r = try XCTUnwrap(t.requests.first)
        XCTAssertEqual(r.url?.path, "/api/flux/v1/events/E1/register")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(r.httpBody)) as? [String: Any])
        XCTAssertEqual(body["tier_id"] as? String, "T")
    }

    func testRegisterSuccessAndReadPaths() async throws {
        let t = FluxMock(200, #"{"guest":{"id":"g1"},"completion_token":"ct"}"#)
        let client = FluxClient(secretKey: "flux_sk_live_1", transport: t)
        guard case .registered(let json) = try await client.register(eventId: "E1", FluxRegisterRequest(name: "A", email: "a@x.io", tierId: "T")) else {
            return XCTFail("expected registered")
        }
        XCTAssertEqual(json["completion_token"]?.stringValue, "ct")
        _ = try await client.event(id: "E1")
        _ = try await client.events()
        _ = try await client.registrationCompletion(registrationId: "g1", token: "ct")
        XCTAssertEqual(t.requests.map { $0.url!.absoluteString }.dropFirst(), [
            "https://apptaptap-vapor-backend.fly.dev/api/flux/v1/events/E1",
            "https://apptaptap-vapor-backend.fly.dev/api/flux/v1/events",
            "https://apptaptap-vapor-backend.fly.dev/api/flux/v1/registrations/g1/completion?token=ct",
        ])
    }

    func testRuntimeURLKeepsTheTokenInTheFragment() {
        let url = FluxEmbed.runtimeURL(eventId: "summer-party", token: "flux_et_live_abc")
        XCTAssertEqual(url?.absoluteString, "https://flux.events/embed/v1/summer-party#t=flux_et_live_abc")
        XCTAssertNil(url?.query)
        XCTAssertNil(FluxEmbed.runtimeURL(eventId: "../evil", token: nil))
        XCTAssertEqual(FluxEmbed.runtimeURL(eventId: "e1", token: nil)?.absoluteString, "https://flux.events/embed/v1/e1")
    }

    func testWrapperMountsThroughTheHostedLoader() {
        let c = FluxEmbed.configuration(eventId: "E1", token: "flux_et_live_abc", hostOrigin: URL(string: "https://app.example.com")!, accent: "#0E6B52")
        XCTAssertEqual(c.namespace, "flux")
        XCTAssertTrue(c.wrapperHTML.contains("https://flux.events/embed/v1/flux.js"))
        XCTAssertTrue(c.mountScript.contains("window.FluxEmbed.mount(document.getElementById('host'),"))
        XCTAssertTrue(c.mountScript.contains(#""eventId":"E1""#))
        XCTAssertTrue(c.mountScript.contains(#""token":"flux_et_live_abc""#))
        XCTAssertTrue(c.shimScript.contains("registration.created"))
    }

    func testEventParsing() {
        let reg = EmbedEvent(type: "registration.created", payload: JSONValue(any: ["registration_id": "g1", "completion_token": NSNull(), "event_id": "E1"]))
        XCTAssertEqual(FluxRegistrationCreated(reg)?.registrationId, "g1")
        XCTAssertNil(FluxRegistrationCreated(reg)?.completionToken)
        let co = EmbedEvent(type: "checkout.required", payload: JSONValue(any: ["event_id": "E1", "tier_id": "T", "checkout_url": "https://flux.events/e/E1/checkout?tier=T"]))
        XCTAssertEqual(FluxCheckoutRequired(co)?.tierId, "T")
        let insecure = EmbedEvent(type: "checkout.required", payload: JSONValue(any: ["checkout_url": "javascript:alert(1)"]))
        XCTAssertNil(FluxCheckoutRequired(insecure))
        let err = EmbedEvent(type: "error", payload: JSONValue(any: ["code": "embed_token_used", "retryable": false]))
        XCTAssertEqual(EmbedError(err)?.code, "embed_token_used")
    }
}
