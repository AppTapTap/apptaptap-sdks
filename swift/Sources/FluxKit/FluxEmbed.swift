import AppTapTapCore
import Foundation

/// The hosted Flux runtime (lane E1): loader `flux.js` defines `window.FluxEmbed` + `<flux-event>`; the
/// iframe is `https://flux.events/embed/v1/:eventId` with the embed token in the `#t=` fragment.
public enum FluxEmbed {
    public static let loaderURL = URL(string: "https://flux.events/embed/v1/flux.js")!
    public static let runtimeOrigin = URL(string: "https://flux.events")!
    public static let namespace = "flux"
    public static let eventTypes = ["ready", "resize", "registration.created", "checkout.required", "error", "close"]

    /// Direct runtime URL (for example to open in a browser): the token rides in the fragment, never the query.
    public static func runtimeURL(eventId: String, token: String?, origin: URL = runtimeOrigin) -> URL? {
        guard eventId.range(of: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$"#, options: .regularExpression) != nil,
              var c = URLComponents(url: origin.appendingPathComponent("embed/v1/\(eventId)"), resolvingAgainstBaseURL: false) else { return nil }
        if let token, !token.isEmpty { c.fragment = "t=\(token)" }
        return c.url
    }

    /// Wrapper-page configuration: `FluxEmbed.mount(#host, {eventId, token, ...})` via the hosted loader.
    public static func configuration(eventId: String, token: String?, hostOrigin: URL, accent: String? = nil,
                                     radius: Int? = nil, font: String? = nil, loaderURL: URL = loaderURL) -> EmbedConfiguration {
        var opts: [String: Any] = ["eventId": eventId]
        if let token { opts["token"] = token }
        if let accent { opts["accent"] = accent }
        if let radius { opts["radius"] = radius }
        if let font { opts["font"] = font }
        let mount = "window.FluxEmbed&&window.FluxEmbed.mount(document.getElementById('host'),\(EmbedConfiguration.jsLiteral(opts)));"
        return EmbedConfiguration(namespace: namespace, loaderURL: loaderURL, hostOrigin: hostOrigin, mountScript: mount, eventTypes: eventTypes)
    }
}

/// `registration.created {registration_id, completion_token, event_id}`. The token is NOT proof: confirm it
/// server-side with `FluxClient.registrationCompletion`.
public struct FluxRegistrationCreated: Equatable, Sendable {
    public let registrationId: String
    public let completionToken: String?
    public let eventId: String
    public init?(_ event: EmbedEvent) {
        guard event.type == "registration.created", let id = event.payload["registration_id"]?.stringValue,
              let eventId = event.payload["event_id"]?.stringValue else { return nil }
        registrationId = id
        completionToken = event.payload["completion_token"]?.stringValue
        self.eventId = eventId
    }
}

/// `checkout.required {event_id, tier_id, checkout_url}`: a priced ticket.
public struct FluxCheckoutRequired: Equatable, Sendable {
    public let eventId: String?
    public let tierId: String?
    public let checkoutURL: URL
    public init?(_ event: EmbedEvent) {
        guard event.type == "checkout.required", let raw = event.payload["checkout_url"]?.stringValue,
              let url = URL(string: raw), url.scheme == "https" else { return nil }
        eventId = event.payload["event_id"]?.stringValue
        tierId = event.payload["tier_id"]?.stringValue
        checkoutURL = url
    }
}

#if canImport(WebKit) && canImport(SwiftUI)
import SwiftUI

/// SwiftUI embed of a Flux event's registration flow.
///
///     FluxEmbedView(eventId: id, token: embedToken, hostOrigin: URL(string: "https://app.example.com")!,
///                   onRegistration: { r in verify(r.completionToken) }, onCheckout: { c in openURL(c.checkoutURL) })
public struct FluxEmbedView: View {
    let configuration: EmbedConfiguration
    let onRegistration: (FluxRegistrationCreated) -> Void
    let onCheckout: (FluxCheckoutRequired) -> Void
    let onError: (EmbedError) -> Void
    let onEvent: (EmbedEvent) -> Void

    /// `hostOrigin` must equal the `allowedOrigin` the token was minted with.
    public init(eventId: String, token: String?, hostOrigin: URL, accent: String? = nil, radius: Int? = nil, font: String? = nil,
                onRegistration: @escaping (FluxRegistrationCreated) -> Void = { _ in },
                onCheckout: @escaping (FluxCheckoutRequired) -> Void = { _ in },
                onError: @escaping (EmbedError) -> Void = { _ in },
                onEvent: @escaping (EmbedEvent) -> Void = { _ in }) {
        configuration = FluxEmbed.configuration(eventId: eventId, token: token, hostOrigin: hostOrigin, accent: accent, radius: radius, font: font)
        self.onRegistration = onRegistration
        self.onCheckout = onCheckout
        self.onError = onError
        self.onEvent = onEvent
    }

    public var body: some View {
        EmbedWebView(configuration: configuration) { event in
            onEvent(event)
            if let r = FluxRegistrationCreated(event) { onRegistration(r) }
            if let c = FluxCheckoutRequired(event) { onCheckout(c) }
            if let e = EmbedError(event) { onError(e) }
        }
    }
}
#endif
