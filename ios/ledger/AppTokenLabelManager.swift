//
//  AppTokenLabelManager.swift
//  ledger
//

import Foundation
import SwiftUI
import FamilyControls

private let appGroupId = "group.com.leeyoumin.ledger"
private let kTokenMap  = "ledger_token_map"

@objc(AppTokenLabelManager)
class AppTokenLabelManager: RCTViewManager {

    override func view() -> UIView! {
        AppTokenLabelView()
    }

    override static func requiresMainQueueSetup() -> Bool { true }
}

// MARK: - UIView that hosts Label(token) SwiftUI view

final class AppTokenLabelView: UIView {

    private var hostingController: UIHostingController<AnyView>?

    @objc var tokenKey: String = "" { didSet { refresh() } }
    @objc var color: String = "#f0ede8" { didSet { refresh() } }
    @objc var fontSize: CGFloat = 14 { didSet { refresh() } }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, hostingController == nil else { return }
        installHostingController()
    }

    private func installHostingController() {
        let hc = UIHostingController(rootView: makeView())
        hc.view.backgroundColor = .clear
        hc.view.translatesAutoresizingMaskIntoConstraints = false
        hc.view.isUserInteractionEnabled = false  // 터치 이벤트 통과
        hc.view.clipsToBounds = true              // SwiftUI 콘텐츠 overflow 차단
        hc.overrideUserInterfaceStyle = .dark     // 다크 모드 강제 → 텍스트 밝게

        if let parentVC = parentViewController() {
            parentVC.addChild(hc)
            addSubview(hc.view)
            hc.didMove(toParent: parentVC)
        } else {
            addSubview(hc.view)
        }

        NSLayoutConstraint.activate([
            hc.view.topAnchor.constraint(equalTo: topAnchor),
            hc.view.bottomAnchor.constraint(equalTo: bottomAnchor),
            hc.view.leadingAnchor.constraint(equalTo: leadingAnchor),
            hc.view.trailingAnchor.constraint(equalTo: trailingAnchor),
        ])
        hostingController = hc
    }

    private func refresh() {
        guard hostingController != nil else { return }
        hostingController?.rootView = makeView()
    }

    private func makeView() -> AnyView {
        guard #available(iOS 16.0, *) else { return AnyView(EmptyView()) }
        let labelColor = parseHexColor(color)
        let size = fontSize

        let json = UserDefaults.standard.string(forKey: kTokenMap)
                 ?? UserDefaults(suiteName: appGroupId)?.string(forKey: kTokenMap)
        guard let json,
              let data = json.data(using: .utf8),
              let map  = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let b64  = map[tokenKey],
              let selData = Data(base64Encoded: b64),
              let sel  = try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: selData),
              let token = sel.applicationTokens.first
        else { return AnyView(EmptyView()) }

        return AnyView(
            GeometryReader { proxy in
                let side = min(proxy.size.width, proxy.size.height)
                Label(token)
                    .labelStyle(.iconOnly)
                    .font(.system(size: side))
                    .scaleEffect(side / 28)
                    .frame(width: proxy.size.width, height: proxy.size.height)
            }
        )
    }

    private func parseHexColor(_ hex: String) -> Color {
        var cleaned = hex.trimmingCharacters(in: .whitespaces)
        if cleaned.hasPrefix("#") { cleaned = String(cleaned.dropFirst()) }
        guard cleaned.count == 6, let val = UInt64(cleaned, radix: 16) else { return .primary }
        let r = Double((val >> 16) & 0xFF) / 255
        let g = Double((val >> 8) & 0xFF) / 255
        let b = Double(val & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }

    private func parentViewController() -> UIViewController? {
        var responder: UIResponder? = next
        while let r = responder {
            if let vc = r as? UIViewController { return vc }
            responder = r.next
        }
        return nil
    }
}
