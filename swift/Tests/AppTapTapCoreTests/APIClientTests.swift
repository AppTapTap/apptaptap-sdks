import AppTapTapCore
import Foundation
import XCTest

final class MockTransport: HTTPTransport, @unchecked Sendable {
    var requests: [URLRequest] = []
    let status: Int
    let body: String
    let headers: [String: String]
    init(status: Int, body: String, headers: [String: String] = [:]) { self.status = status; self.body = body; self.headers = headers }
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        requests.append(request)
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: headers)!)
    }
}

final class APIClientTests: XCTestCase {
    func testRequestBuilding() {
        let api = APIClient(baseURL: URL(string: "https://api.example.com/base")!, bearer: "sk_x", product: "t", transport: MockTransport(status: 200, body: "{}"))
        let r = api.makeRequest(method: "POST", path: ["a b", "c"], query: [URLQueryItem(name: "token", value: "x y")], body: Data("{}".utf8), idempotencyKey: "k1")
        XCTAssertEqual(r.url?.absoluteString, "https://api.example.com/base/a%20b/c?token=x%20y")
        XCTAssertEqual(r.httpMethod, "POST")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer sk_x")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Idempotency-Key"), "k1")
        XCTAssertEqual(r.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertNil(api.makeRequest(method: "GET", path: ["x"]).value(forHTTPHeaderField: "Idempotency-Key"))
    }

    func testErrorEnvelope() async throws {
        let t = MockTransport(status: 429, body: #"{"error":"rate_limited","message":"Slow down."}"#, headers: ["X-Request-Id": "req_1"])
        let api = APIClient(baseURL: URL(string: "https://api.example.com")!, bearer: "k", product: "t", transport: t)
        do {
            let _: JSONValue = try await api.send(api.makeRequest(method: "GET", path: ["x"]))
            XCTFail("expected APIError")
        } catch let e as APIError {
            XCTAssertEqual(e.status, 429)
            XCTAssertEqual(e.code, "rate_limited")
            XCTAssertEqual(e.message, "Slow down.")
            XCTAssertEqual(e.requestID, "req_1")
        }
    }

    func testWrapperEscapesScriptBreakout() {
        let lit = EmbedConfiguration.jsLiteral(["x": "</script><script>alert(1)</script>"])
        XCTAssertFalse(lit.contains("</script>"))
        let c = EmbedConfiguration(namespace: "lbb", loaderURL: URL(string: "https://example.com/l.js")!, hostOrigin: URL(string: "https://app.example.com")!,
                                   mountScript: "m()", eventTypes: ["ready", "error"])
        XCTAssertTrue(c.wrapperHTML.contains(#"<script src="https://example.com/l.js"></script>"#))
        XCTAssertTrue(c.shimScript.contains("messageHandlers.apptaptap"))
        XCTAssertTrue(c.shimScript.contains(#"["ready","error"]"#))
    }
}
