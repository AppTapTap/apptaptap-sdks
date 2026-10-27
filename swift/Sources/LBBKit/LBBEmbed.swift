import AppTapTapCore
import Foundation

/// The hosted Little Black Box runtime: loader `lbb.js` defines `window.LBB` + `<lbb-survey>`; the iframe is
/// `https://littleblackbox.app/x/<slug>` with the embed token in the `#et=` fragment.
public enum LBBEmbed {
    public static let loaderURL = URL(string: "https://littleblackbox.app/embed/v1/lbb.js")!
    public static let runtimeOrigin = URL(string: "https://littleblackbox.app")!
    public static let namespace = "lbb"
    public static let eventTypes = ["ready", "resize", "response.started", "page.changed", "response.completed", "redirect", "error", "close"]

    /// Direct runtime URL: the token rides in the fragment, never the query.
    public static func runtimeURL(slug: String, token: String?, origin: URL = runtimeOrigin) -> URL? {
        guard !slug.isEmpty, var c = URLComponents(url: origin, resolvingAgainstBaseURL: false) else { return nil }
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
        c.percentEncodedPath = "/x/" + (slug.addingPercentEncoding(withAllowedCharacters: allowed) ?? slug)
        if let token, !token.isEmpty { c.fragment = "et=\(token)" }
        return c.url
    }

    /// Wrapper-page configuration: `LBB.mount(#host, {survey, fetchToken})` via the hosted loader (its
    /// `fetchToken` puts the embed token in the `#et=` fragment).
    public static func configuration(slug: String, token: String?, hostOrigin: URL, theme: String? = nil, accent: String? = nil,
                                     lang: String? = nil, loaderURL: URL = loaderURL) -> EmbedConfiguration {
        var opts: [String: Any] = ["survey": slug]
        if let theme { opts["theme"] = theme }
        if let accent { opts["accent"] = accent }
        if let lang { opts["lang"] = lang }
        let tokenJS = token.map { EmbedConfiguration.jsLiteral(["t": $0]) + ".t" } ?? "null"
        let mount = "(function(){var o=\(EmbedConfiguration.jsLiteral(opts)),t=\(tokenJS);if(t)o.fetchToken=function(){return t};"
            + "window.LBB&&window.LBB.mount(document.getElementById('host'),o)})();"
        return EmbedConfiguration(namespace: namespace, loaderURL: loaderURL, hostOrigin: hostOrigin, mountScript: mount, eventTypes: eventTypes)
    }
}

/// `response.completed {session_id, completion_token?}`. Confirm server-side before granting anything.
public struct LBBResponseCompleted: Equatable, Sendable {
    public let sessionId: String
    public let completionToken: String?
    public init?(_ event: EmbedEvent) {
        guard event.type == "response.completed", let id = event.payload["session_id"]?.stringValue else { return nil }
        sessionId = id
        completionToken = event.payload["completion_token"]?.stringValue
    }
}

#if canImport(WebKit) && canImport(SwiftUI)
import SwiftUI

/// SwiftUI embed of a Little Black Box survey.
public struct LBBEmbedView: View {
    let configuration: EmbedConfiguration
    let onCompleted: (LBBResponseCompleted) -> Void
    let onError: (EmbedError) -> Void
    let onEvent: (EmbedEvent) -> Void

    /// `hostOrigin` must equal the `allowedOrigin` the token was minted with.
    public init(slug: String, token: String?, hostOrigin: URL, theme: String? = nil, accent: String? = nil, lang: String? = nil,
                onCompleted: @escaping (LBBResponseCompleted) -> Void = { _ in },
                onError: @escaping (EmbedError) -> Void = { _ in },
                onEvent: @escaping (EmbedEvent) -> Void = { _ in }) {
        configuration = LBBEmbed.configuration(slug: slug, token: token, hostOrigin: hostOrigin, theme: theme, accent: accent, lang: lang)
        self.onCompleted = onCompleted
        self.onError = onError
        self.onEvent = onEvent
    }

    public var body: some View {
        EmbedWebView(configuration: configuration) { event in
            onEvent(event)
            if let c = LBBResponseCompleted(event) { onCompleted(c) }
            if let e = EmbedError(event) { onError(e) }
        }
    }
}
#endif
