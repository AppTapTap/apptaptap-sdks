// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "AppTapTapSDK",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "FluxKit", targets: ["FluxKit"]),
        .library(name: "LBBKit", targets: ["LBBKit"]),
        .library(name: "AppTapTapCore", targets: ["AppTapTapCore"]),
    ],
    targets: [
        .target(name: "AppTapTapCore"),
        .target(name: "FluxKit", dependencies: ["AppTapTapCore"]),
        .target(name: "LBBKit", dependencies: ["AppTapTapCore"]),
        .testTarget(name: "AppTapTapCoreTests", dependencies: ["AppTapTapCore"]),
        .testTarget(name: "FluxKitTests", dependencies: ["FluxKit"]),
        .testTarget(name: "LBBKitTests", dependencies: ["LBBKit"]),
    ]
)
