import Foundation

/// One protocol-v1 event forwarded from the hosted runtime (`flux:<type>` / `lbb:<type>` DOM events).
public struct EmbedEvent: Equatable, Sendable {
    public let type: String
    public let payload: JSONValue
    public init(type: String, payload: JSONValue) {
        self.type = type
        self.payload = payload
    }
}

/// `error {code, retryable, message?}`, shared by both runtimes.
public struct EmbedError: Equatable, Sendable {
    public let code: String
    public let retryable: Bool
    public let message: String?
    public init?(_ event: EmbedEvent) {
        guard event.type == "error", let code = event.payload["code"]?.stringValue else { return nil }
        self.code = code
        self.retryable = event.payload["retryable"]?.boolValue ?? false
        self.message = event.payload["message"]?.stringValue
    }
}

/// What a native embed needs: the hosted loader, the JS that mounts into `#host`, and the DOM events to forward.
public struct EmbedConfiguration: Equatable, Sendable {
    /// Script-message handler name the shim posts to.
    public static let handlerName = "apptaptap"

    public let namespace: String
    public let loaderURL: URL
    /// Origin the wrapper page runs at (`loadHTMLString` base URL). Use the same value as `allowed_origin`
    /// when you mint the embed token.
    public let hostOrigin: URL
    public let mountScript: String
    public let eventTypes: [String]

    public init(namespace: String, loaderURL: URL, hostOrigin: URL, mountScript: String, eventTypes: [String]) {
        self.namespace = namespace
        self.loaderURL = loaderURL
        self.hostOrigin = hostOrigin
        self.mountScript = mountScript
        self.eventTypes = eventTypes
    }

    /// JSON literal safe to place inside an inline `<script>` (no `</script>` breakout, no U+2028 surprises).
    public static func jsLiteral(_ object: [String: Any]) -> String {
        let data = (try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])) ?? Data("{}".utf8)
        return String(decoding: data, as: UTF8.self)
            .replacingOccurrences(of: "</", with: "<\\/")
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }

    /// The tiny wrapper page: a `#host` element, the hosted loader, then the mount call.
    public var wrapperHTML: String {
        let loader = loaderURL.absoluteString.replacingOccurrences(of: "\"", with: "%22")
        return """
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
        <style>html,body{margin:0;padding:0;background:transparent}#host{display:block;width:100%}</style>
        </head><body><div id="host"></div>
        <script src="\(loader)"></script>
        <script>\(mountScript)</script>
        </body></html>
        """
    }

    /// Injected at document start (main frame only): forwards `<namespace>:<type>` DOM events, which the
    /// hosted loaders dispatch on the host element (bubbles, composed), to the native message handler.
    public var shimScript: String {
        let types = Self.jsLiteral(["t": eventTypes])
        return """
        (function(){var NS=\(Self.jsLiteral(["ns": namespace])).ns,T=\(types).t;
        function post(type,detail){try{window.webkit.messageHandlers.\(Self.handlerName).postMessage({type:type,payload:(detail&&typeof detail==='object')?detail:{}})}catch(e){}}
        T.forEach(function(t){document.addEventListener(NS+':'+t,function(e){post(t,e.detail)},true)});
        window.addEventListener('error',function(e){if(e&&e.target&&e.target.tagName==='SCRIPT')post('error',{code:'runtime_load_failed',retryable:true})},true);
        })();
        """
    }
}

#if canImport(WebKit) && canImport(SwiftUI)
import SwiftUI
import WebKit

/// Receives the shim's messages without retaining the view (WKUserContentController retains its handlers).
final class EmbedMessageProxy: NSObject, WKScriptMessageHandler {
    var onEvent: (EmbedEvent) -> Void
    init(onEvent: @escaping (EmbedEvent) -> Void) { self.onEvent = onEvent }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == EmbedConfiguration.handlerName else { return }
        let body = JSONValue(any: message.body)
        guard let type = body["type"]?.stringValue else { return }
        onEvent(EmbedEvent(type: type, payload: body["payload"] ?? .object([:])))
    }
}

/// SwiftUI host for a hosted embed runtime: a WKWebView loading `wrapperHTML` at `hostOrigin`.
public struct EmbedWebView {
    public let configuration: EmbedConfiguration
    public let onEvent: (EmbedEvent) -> Void

    public init(configuration: EmbedConfiguration, onEvent: @escaping (EmbedEvent) -> Void) {
        self.configuration = configuration
        self.onEvent = onEvent
    }

    public final class Coordinator {
        let proxy: EmbedMessageProxy
        var loaded: EmbedConfiguration?
        init(onEvent: @escaping (EmbedEvent) -> Void) { proxy = EmbedMessageProxy(onEvent: onEvent) }
    }

    public func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

    func makeWebView(_ coordinator: Coordinator) -> WKWebView {
        let content = WKUserContentController()
        content.add(coordinator.proxy, name: EmbedConfiguration.handlerName)
        content.addUserScript(WKUserScript(source: configuration.shimScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let config = WKWebViewConfiguration()
        config.userContentController = content
        let web = WKWebView(frame: .zero, configuration: config)
        #if os(iOS)
        web.isOpaque = false
        web.backgroundColor = .clear
        #endif
        load(web, coordinator)
        return web
    }

    func load(_ web: WKWebView, _ coordinator: Coordinator) {
        coordinator.proxy.onEvent = onEvent
        guard coordinator.loaded != configuration else { return }
        coordinator.loaded = configuration
        web.loadHTMLString(configuration.wrapperHTML, baseURL: configuration.hostOrigin)
    }
}

#if os(iOS)
extension EmbedWebView: UIViewRepresentable {
    public func makeUIView(context: Context) -> WKWebView { makeWebView(context.coordinator) }
    public func updateUIView(_ web: WKWebView, context: Context) { load(web, context.coordinator) }
    public static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: EmbedConfiguration.handlerName)
    }
}
#elseif os(macOS)
extension EmbedWebView: NSViewRepresentable {
    public func makeNSView(context: Context) -> WKWebView { makeWebView(context.coordinator) }
    public func updateNSView(_ web: WKWebView, context: Context) { load(web, context.coordinator) }
    public static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: EmbedConfiguration.handlerName)
    }
}
#endif
#endif
