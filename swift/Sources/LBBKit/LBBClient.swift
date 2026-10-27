import AppTapTapCore
import Foundation

public struct LBBEmbedSession: Decodable, Equatable, Sendable {
    /// `lbb_et_…`: 10 minutes, redeemed once. It travels in the iframe URL fragment (`#et=`).
    public let embedToken: String
    public let expiresAt: String
    enum CodingKeys: String, CodingKey { case embedToken = "embed_token", expiresAt = "expires_at" }
}

/// Server-side Little Black Box client (`/v1`). `createEmbedSession` and `surveys()` need a SECRET key
/// (`lbb_sk_…`); never ship one inside an app binary. `survey(slug:)` is a public read.
public struct LBBClient: Sendable {
    /// Production API host (servers: in docs/openapi.yaml).
    public static let defaultBaseURL = URL(string: "https://api.littleblackbox.app")!
    public let api: APIClient

    public init(apiKey: String, baseURL: URL = LBBClient.defaultBaseURL, transport: HTTPTransport = URLSessionTransport()) {
        api = APIClient(baseURL: baseURL, bearer: apiKey, product: "lbb", transport: transport)
    }

    struct EmbedSessionBody: Encodable {
        let survey: String
        let allowedOrigin: String
        let externalRef: String?
        let embeddedData: [String: String]?
        let language: String?
        enum CodingKeys: String, CodingKey {
            case survey, allowedOrigin = "allowed_origin", externalRef = "external_ref", embeddedData = "embedded_data", language
        }
    }

    public func createEmbedSessionRequest(survey: String, allowedOrigin: String, externalRef: String? = nil,
                                          embeddedData: [String: String]? = nil, language: String? = nil,
                                          idempotencyKey: String? = nil) throws -> URLRequest {
        let body = EmbedSessionBody(survey: survey, allowedOrigin: allowedOrigin, externalRef: externalRef, embeddedData: embeddedData, language: language)
        return api.makeRequest(method: "POST", path: ["v1", "embed", "sessions"], body: try APIClient.encode(body), idempotencyKey: idempotencyKey)
    }

    /// `POST /v1/embed/sessions` → a one-time embed token bound to one survey and one origin.
    public func createEmbedSession(survey: String, allowedOrigin: String, externalRef: String? = nil,
                                   embeddedData: [String: String]? = nil, language: String? = nil,
                                   idempotencyKey: String? = nil) async throws -> LBBEmbedSession {
        try await api.send(createEmbedSessionRequest(survey: survey, allowedOrigin: allowedOrigin, externalRef: externalRef,
                                                     embeddedData: embeddedData, language: language, idempotencyKey: idempotencyKey))
    }

    /// `GET /v1/surveys` (raw JSON).
    public func surveys() async throws -> JSONValue {
        try await api.send(api.makeRequest(method: "GET", path: ["v1", "surveys"]))
    }

    /// `GET /v1/public/surveys/{slug}` (raw JSON).
    public func survey(slug: String) async throws -> JSONValue {
        try await api.send(surveyRequest(slug: slug))
    }

    public func surveyRequest(slug: String) -> URLRequest {
        api.makeRequest(method: "GET", path: ["v1", "public", "surveys", slug])
    }

    /// `GET /v1/responses/{id}/completion` — confirm a browser-reported completion before granting anything.
    public func responseCompletion(responseId: String) async throws -> JSONValue {
        try await api.send(api.makeRequest(method: "GET", path: ["v1", "responses", responseId, "completion"]))
    }
}
