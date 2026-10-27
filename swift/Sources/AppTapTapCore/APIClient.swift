import Foundation

/// Error envelope `{error, message, request_id}` shared by Flux `/api/flux/v1` and Little Black Box `/v1`.
public struct APIError: Error, Equatable, Sendable {
    public let status: Int
    public let code: String
    public let message: String
    public let requestID: String?
    /// The full JSON body (Flux 409 `payment_required` carries `checkout_url` here).
    public let body: JSONValue?
}

/// Sends a request. Inject a fake in tests; `URLSessionTransport` is the default.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}

public struct URLSessionTransport: HTTPTransport {
    public let session: URLSession
    public init(session: URLSession = .shared) { self.session = session }
    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }
}

/// Minimal JSON client: bearer auth, optional Idempotency-Key, the shared error envelope.
public struct APIClient: Sendable {
    public static let sdkVersion = "0.1.0"
    public let baseURL: URL
    public let bearer: String
    public let product: String
    public let transport: HTTPTransport

    public init(baseURL: URL, bearer: String, product: String, transport: HTTPTransport = URLSessionTransport()) {
        self.baseURL = baseURL
        self.bearer = bearer
        self.product = product
        self.transport = transport
    }

    /// Builds the request (exposed for tests). `path` segments are percent-encoded individually.
    public func makeRequest(method: String, path: [String], query: [URLQueryItem] = [], body: Data? = nil, idempotencyKey: String? = nil) -> URLRequest {
        var url = baseURL
        for segment in path { url.appendPathComponent(segment) }
        if !query.isEmpty, var c = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            c.queryItems = query
            url = c.url ?? url
        }
        var r = URLRequest(url: url)
        r.httpMethod = method
        r.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        r.setValue("apptaptap-sdks-swift/\(Self.sdkVersion) (\(product))", forHTTPHeaderField: "User-Agent")
        if let body {
            r.httpBody = body
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let idempotencyKey { r.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        return r
    }

    /// Sends and decodes; a non-2xx answer throws `APIError`.
    public func send<T: Decodable>(_ request: URLRequest, as type: T.Type = T.self) async throws -> T {
        let (data, response) = try await transport.send(request)
        guard (200..<300).contains(response.statusCode) else { throw Self.error(status: response.statusCode, data: data, headers: response) }
        return try JSONDecoder().decode(T.self, from: data)
    }

    public static func error(status: Int, data: Data, headers: HTTPURLResponse?) -> APIError {
        let body = try? JSONDecoder().decode(JSONValue.self, from: data)
        let code = body?["error"]?.stringValue ?? "http_\(status)"
        let message = body?["message"]?.stringValue ?? body?["reason"]?.stringValue ?? "HTTP \(status)"
        let requestID = body?["request_id"]?.stringValue ?? headers?.value(forHTTPHeaderField: "X-Request-Id")
        return APIError(status: status, code: code, message: message, requestID: requestID, body: body)
    }

    public static func encode<T: Encodable>(_ value: T) throws -> Data {
        let e = JSONEncoder()
        e.outputFormatting = [.sortedKeys]
        return try e.encode(value)
    }
}
