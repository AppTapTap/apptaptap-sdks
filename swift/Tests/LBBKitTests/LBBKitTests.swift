import AppTapTapCore
import Foundation
import LBBKit
import XCTest

final class LBBMock: HTTPTransport, @unchecked Sendable {
    var requests: [URLRequest] = []
    let status: Int, body: String
    init(_ status: Int, _ body: String) { self.status = status; self.body = body }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

final class LBBKitTests: XCTestCase {
    func testCreateEmbedSession() async throws {
        let t = LBBMock(201, #"{"embed_token":"lbb_et_live_abc","expires_at":"2026-10-27T00:10:00Z"}"#)
        let s = try await LBBClient(apiKey: "lbb_sk_live_1", transport: t)
            .createEmbedSession(survey: "nps-q4", allowedOrigin: "https://app.example.com", externalRef: "user_1842", embeddedData: ["plan": "pro"])
        XCTAssertEqual(s.embedToken, "lbb_et_live_abc")
        XCTAssertEqual(s.expiresAt, "2026-10-27T00:10:00Z")
        let r = try XCTUnwrap(t.requests.first)
        XCTAssertEqual(r.url?.absoluteString, "https://api.littleblackbox.app/v1/embed/sessions")
        XCTAssertNil(r.value(forHTTPHeaderField: "Idempotency-Key"))
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(r.httpBody)) as? [String: Any])
        XCTAssertEqual(body["survey"] as? String, "nps-q4")
        XCTAssertEqual(body["allowed_origin"] as? String, "https://app.example.com")
        XCTAssertEqual(body["external_ref"] as? String, "user_1842")
    }

    func testReadPathsAndErrors() async throws {
        let client = LBBClient(apiKey: "lbb_pk_live_1", transport: LBBMock(404, #"{"error":"not_found","message":"Survey not found.","request_id":"r1"}"#))
        XCTAssertEqual(client.surveyRequest(slug: "a b").url?.absoluteString, "https://api.littleblackbox.app/v1/public/surveys/a%20b")
        do { _ = try await client.survey(slug: "missing"); XCTFail("expected 404") } catch let e as APIError {
            XCTAssertEqual(e.code, "not_found")
            XCTAssertEqual(e.requestID, "r1")
        }
    }

    func testRuntimeURLKeepsTheTokenInTheFragment() {
        let url = LBBEmbed.runtimeURL(slug: "nps-q4", token: "lbb_et_live_abc")
        XCTAssertEqual(url?.absoluteString, "https://littleblackbox.app/x/nps-q4#et=lbb_et_live_abc")
        XCTAssertNil(url?.query)
        XCTAssertEqual(LBBEmbed.runtimeURL(slug: "a/b", token: nil)?.absoluteString, "https://littleblackbox.app/x/a%2Fb")
    }

    func testWrapperUsesFetchTokenAndForwardsLBBEvents() {
        let c = LBBEmbed.configuration(slug: "nps-q4", token: "lbb_et_live_abc", hostOrigin: URL(string: "https://app.example.com")!)
        XCTAssertTrue(c.wrapperHTML.contains("https://littleblackbox.app/embed/v1/lbb.js"))
        XCTAssertTrue(c.mountScript.contains("o.fetchToken=function(){return t}"))
        XCTAssertTrue(c.mountScript.contains(#"{"t":"lbb_et_live_abc"}.t"#))
        XCTAssertTrue(c.shimScript.contains("response.completed"))
        let done = EmbedEvent(type: "response.completed", payload: JSONValue(any: ["session_id": "S1", "completion_token": "ct"]))
        XCTAssertEqual(LBBResponseCompleted(done)?.completionToken, "ct")
    }
}
