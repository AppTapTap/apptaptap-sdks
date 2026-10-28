import AppTapTapCore
import Foundation

public struct FluxEmbedSession: Decodable, Equatable, Sendable {
    /// `flux_et_live_…` / `flux_et_test_…`: redeemed once. Hand it to the embed; it travels in the URL fragment.
    public let embedToken: String
    public let expiresAt: String
    public let eventId: String?
    public let mode: String?
    enum CodingKeys: String, CodingKey { case embedToken = "embed_token", expiresAt = "expires_at", eventId = "event_id", mode }
}

public struct FluxRegisterRequest: Encodable, Equatable, Sendable {
    public var name: String
    public var email: String
    public var tierId: String
    public var quantity: Int?
    public var note: String?
    public var promoCode: String?
    public var phone: String?
    public var customResponses: [String: String]?
    public init(name: String, email: String, tierId: String, quantity: Int? = nil, note: String? = nil, promoCode: String? = nil,
                phone: String? = nil, customResponses: [String: String]? = nil) {
        self.name = name; self.email = email; self.tierId = tierId; self.quantity = quantity; self.note = note
        self.promoCode = promoCode; self.phone = phone; self.customResponses = customResponses
    }
    enum CodingKeys: String, CodingKey {
        case name, email, tierId = "tier_id", quantity, note, promoCode = "promo_code", phone, customResponses = "custom_responses"
    }
}

public enum FluxRegisterOutcome: Equatable, Sendable {
    /// The registration (raw JSON; `completion_token` when an API key or embed token was involved).
    case registered(JSONValue)
    /// A priced ticket with payments on: send the buyer to `checkoutURL`.
    case paymentRequired(checkoutURL: URL)
}

/// Server-side Flux client (`/api/flux/v1`). Use a SECRET key (`flux_sk_…`) only from code you control;
/// never ship it inside an app binary.
public struct FluxClient: Sendable {
    public static let defaultBaseURL = URL(string: "https://apptaptap-vapor-backend.fly.dev/api/flux/v1")!
    public let api: APIClient

    public init(secretKey: String, baseURL: URL = FluxClient.defaultBaseURL, transport: HTTPTransport = URLSessionTransport()) {
        api = APIClient(baseURL: baseURL, bearer: secretKey, product: "flux", transport: transport)
    }

    struct EmbedSessionBody: Encodable {
        let event: String
        let allowedOrigin: String?
        let externalRef: String?
        let embeddedData: [String: String]?
        let locked: [String]?
        let poweredBy: Bool?
        let expiresInSec: Int?
        enum CodingKeys: String, CodingKey {
            case event, allowedOrigin = "allowed_origin", externalRef = "external_ref", embeddedData = "embedded_data", locked,
                 poweredBy = "powered_by", expiresInSec = "expires_in_sec"
        }
    }

    public func createEmbedSessionRequest(eventId: String, allowedOrigin: String? = nil, externalRef: String? = nil,
                                          embeddedData: [String: String]? = nil, locked: [String]? = nil, poweredBy: Bool? = nil,
                                          expiresInSec: Int? = nil, idempotencyKey: String? = nil) throws -> URLRequest {
        let body = EmbedSessionBody(event: eventId, allowedOrigin: allowedOrigin, externalRef: externalRef, embeddedData: embeddedData,
                                    locked: locked, poweredBy: poweredBy, expiresInSec: expiresInSec)
        return api.makeRequest(method: "POST", path: ["embed", "sessions"], body: try APIClient.encode(body), idempotencyKey: idempotencyKey)
    }

    /// `POST /embed/sessions` → a one-time embed token for one event (and optionally one origin and one customer).
    /// `allowedOrigin` also works inside the Flux iframe (the frame sends `embed_origin`). Keys in `locked` show read-only in the
    /// embed (name, email, matching custom-question labels). `poweredBy: false` hides "Powered by Flux" for this token; nil leaves
    /// the server default (shown) and is not sent.
    public func createEmbedSession(eventId: String, allowedOrigin: String? = nil, externalRef: String? = nil,
                                   embeddedData: [String: String]? = nil, locked: [String]? = nil, poweredBy: Bool? = nil,
                                   expiresInSec: Int? = nil, idempotencyKey: String? = nil) async throws -> FluxEmbedSession {
        try await api.send(createEmbedSessionRequest(eventId: eventId, allowedOrigin: allowedOrigin, externalRef: externalRef,
                                                     embeddedData: embeddedData, locked: locked, poweredBy: poweredBy,
                                                     expiresInSec: expiresInSec, idempotencyKey: idempotencyKey))
    }

    /// `GET /events` (raw JSON).
    public func events() async throws -> JSONValue {
        try await api.send(api.makeRequest(method: "GET", path: ["events"]))
    }

    /// `GET /events/{id}` (raw JSON; includes `calendar_url`).
    public func event(id: String) async throws -> JSONValue {
        try await api.send(api.makeRequest(method: "GET", path: ["events", id]))
    }

    public func registerRequest(eventId: String, _ body: FluxRegisterRequest, idempotencyKey: String? = nil) throws -> URLRequest {
        api.makeRequest(method: "POST", path: ["events", eventId, "register"], body: try APIClient.encode(body), idempotencyKey: idempotencyKey)
    }

    /// `POST /events/{id}/register`. A 409 `payment_required` becomes `.paymentRequired(checkoutURL:)`.
    public func register(eventId: String, _ body: FluxRegisterRequest, idempotencyKey: String? = nil) async throws -> FluxRegisterOutcome {
        do {
            return .registered(try await api.send(registerRequest(eventId: eventId, body, idempotencyKey: idempotencyKey)))
        } catch let e as APIError where e.status == 409 && e.code == "payment_required" {
            if let raw = e.body?["checkout_url"]?.stringValue, let url = URL(string: raw), url.scheme == "https" {
                return .paymentRequired(checkoutURL: url)
            }
            throw e
        }
    }

    /// `GET /registrations/{id}/completion?token=` — what the server actually recorded for a completion token.
    public func registrationCompletion(registrationId: String, token: String) async throws -> JSONValue {
        try await api.send(api.makeRequest(method: "GET", path: ["registrations", registrationId, "completion"], query: [URLQueryItem(name: "token", value: token)]))
    }
}
