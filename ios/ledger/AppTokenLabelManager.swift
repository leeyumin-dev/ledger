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
    override func view() -> UIView! { AppTokenLabelView() }
    override static func requiresMainQueueSetup() -> Bool { true }
}

// MARK: - Host View

final class AppTokenLabelView: UIView {

    // MARK: Props
    @objc var tokenKey: String = "" { didSet { scheduleUpdate() } }
    @objc var color: String    = "#f0ede8" { didSet { scheduleUpdate() } }
    @objc var fontSize: CGFloat = 14       { didSet { scheduleUpdate() } }
    @objc var iconOnly: Bool   = false     { didSet { scheduleUpdate() } }

    // MARK: Private
    private let hostingController: UIHostingController<AnyView>
    private var pendingUpdate = false

    // MARK: Init — hosting controller는 init에서 즉시 생성 (lazy 없음)
    override init(frame: CGRect) {
        hostingController = UIHostingController(rootView: AnyView(EmptyView()))
        super.init(frame: frame)
        commonInit()
    }

    required init?(coder: NSCoder) {
        hostingController = UIHostingController(rootView: AnyView(EmptyView()))
        super.init(coder: coder)
        commonInit()
    }

    private func commonInit() {
        hostingController.view.backgroundColor = .clear
        hostingController.view.isUserInteractionEnabled = false
        hostingController.view.clipsToBounds = false
        hostingController.overrideUserInterfaceStyle = .dark
        // Auto Layout 사용하지 않음 — frame 기반으로 layoutSubviews에서 동기화
        addSubview(hostingController.view)
    }

    // MARK: Layout — bounds 변경 시 hosting view frame 즉시 동기화
    override func layoutSubviews() {
        super.layoutSubviews()
        hostingController.view.frame = bounds
    }

    // MARK: Update — tokenKey 변경 시 즉시 clear 후 다음 런루프에서 새 컨텐츠 설정
    // 여러 prop이 동시에 바뀔 때(배치 업데이트) 중복 refresh 방지
    private func scheduleUpdate() {
        guard !pendingUpdate else { return }
        pendingUpdate = true
        // 먼저 비움 → 부분 업데이트(아이콘만 바뀌고 이름은 구 상태) 글리치 방지
        hostingController.rootView = AnyView(EmptyView())
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.pendingUpdate = false
            self.hostingController.rootView = self.makeView()
        }
    }

    // MARK: Content
    private func makeView() -> AnyView {
        guard #available(iOS 16.0, *) else { return AnyView(EmptyView()) }

        let labelColor = parseHexColor(color)
        let size = fontSize

        // 토큰맵 로드
        let json = UserDefaults(suiteName: appGroupId)?.string(forKey: kTokenMap)
                ?? UserDefaults.standard.string(forKey: kTokenMap)

        guard
            let json,
            let data   = json.data(using: .utf8),
            let map    = try? JSONSerialization.jsonObject(with: data) as? [String: String],
            let b64    = map[tokenKey],
            let selData = Data(base64Encoded: b64),
            let sel    = try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: selData)
        else {
            // 재설치 등으로 토큰 없을 때 폴백
            return AnyView(
                Text("앱")
                    .font(.system(size: size))
                    .foregroundColor(labelColor)
                    .frame(maxWidth: .infinity, alignment: .leading)
            )
        }

        if let token = sel.applicationTokens.first {
            if iconOnly {
                return AnyView(
                    Label(token)
                        .labelStyle(.iconOnly)
                        .font(.system(size: size))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                )
            }
            return AnyView(
                HStack(spacing: 6) {
                    Label(token).labelStyle(.iconOnly).font(.system(size: size))
                    Label(token).labelStyle(.titleOnly)
                        .font(.system(size: size))
                        .foregroundColor(labelColor)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            )
        } else if let catToken = sel.categoryTokens.first {
            if iconOnly {
                return AnyView(
                    Label(catToken)
                        .labelStyle(.iconOnly)
                        .font(.system(size: size))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                )
            }
            return AnyView(
                HStack(spacing: 6) {
                    Label(catToken).labelStyle(.iconOnly).font(.system(size: size))
                    Label(catToken).labelStyle(.titleOnly)
                        .font(.system(size: size))
                        .foregroundColor(labelColor)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            )
        }
        return AnyView(EmptyView())
    }

    // MARK: Hex color parser
    private func parseHexColor(_ hex: String) -> Color {
        var h = hex.trimmingCharacters(in: .whitespaces)
        if h.hasPrefix("#") { h = String(h.dropFirst()) }
        guard h.count == 6, let val = UInt64(h, radix: 16) else { return .primary }
        return Color(
            red:   Double((val >> 16) & 0xFF) / 255,
            green: Double((val >>  8) & 0xFF) / 255,
            blue:  Double( val        & 0xFF) / 255
        )
    }
}
