//
//  ScreenTimeModule.swift
//  ledger
//

import Foundation
import FamilyControls
import DeviceActivity
import SwiftUI

private let appGroupId   = "group.com.leeyoumin.ledger"
private let activityName = DeviceActivityName("ledger.daily")

// UserDefaults 키
private let kTokenMap  = "ledger_token_map"   // { "app_0": "<base64>" }
private let kTokenList = "ledger_token_list"  // ["app_0", "app_1"] — 순서 보장
private let kAppMap    = "ledger_app_map"     // { "0": "app_0", "1": "app_1" } — Extension용
private let kNameMap   = "ledger_name_map"    // { "app_0": "유튜브" } — 사용자 입력 이름

@objc(ScreenTimeModule)
class ScreenTimeModule: NSObject {

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // MARK: - 권한 요청

    @objc
    func requestAuthorization(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.0, *) else {
            reject("VERSION_ERROR", "iOS 16 이상에서만 사용 가능해요.", nil); return
        }
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                resolve("authorized")
            } catch {
                reject("AUTH_ERROR", error.localizedDescription, error)
            }
        }
    }

    // MARK: - 권한 상태 확인

    @objc
    func getAuthorizationStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.0, *) else {
            resolve("unavailable"); return
        }
        switch AuthorizationCenter.shared.authorizationStatus {
        case .approved:      resolve("approved")
        case .denied:        resolve("denied")
        case .notDetermined: resolve("notDetermined")
        @unknown default:    resolve("unknown")
        }
    }

    // MARK: - 피커 열기 → 선택된 토큰을 __pending_0__, __pending_1__... 으로 저장

    @objc
    func presentPickerForToken(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.0, *) else {
            reject("VERSION_ERROR", "iOS 16 이상에서만 사용 가능해요.", nil); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let topVC = Self.topmostViewController() else {
                reject("UI_ERROR", "ViewController를 찾을 수 없어요.", nil); return
            }
            let vc = AppPickerHostingController(
                title: "추적할 앱 선택",
                onComplete: { [weak self] selection in
                    let appTokens = Array(selection.applicationTokens)
                    let catTokens = Array(selection.categoryTokens)

                    // 개별 앱 없이 카테고리만 선택한 경우
                    if appTokens.isEmpty && !catTokens.isEmpty {
                        resolve("category_only"); return
                    }
                    guard !appTokens.isEmpty else {
                        resolve("cancelled"); return
                    }
                    for (i, token) in appTokens.enumerated() {
                        var singleSel = FamilyActivitySelection()
                        singleSel.applicationTokens = [token]
                        self?.saveTokenForApp(appName: "__pending_\(i)__", selection: singleSel)
                    }
                    resolve("selected:\(appTokens.count)")
                },
                onCancel: { resolve("cancelled") }
            )
            vc.modalPresentationStyle = .pageSheet
            topVC.present(vc, animated: true)
        }
    }

    // MARK: - __pending_{index}__ 토큰에 자동으로 app_N 키 부여 (중복 시 null 반환)

    @objc
    func confirmPendingTokenAuto(
        _ index: NSInteger,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        var tokenMap  = loadTokenMap()
        var tokenList = loadTokenList()

        let pendingKey = "__pending_\(index)__"
        guard let b64 = tokenMap[pendingKey] else {
            reject("NO_PENDING", "대기 중인 토큰이 없어요.", nil); return
        }

        // 중복 검사: base64 인코딩된 데이터 직접 비교 (동일 앱 = 동일 토큰 바이트)
        for existingKey in tokenList where !existingKey.hasPrefix("__pending_") {
            if let existB64 = tokenMap[existingKey], existB64 == b64 {
                // 중복 발견 → pending 정리 후 null 반환
                tokenMap.removeValue(forKey: pendingKey)
                tokenList.removeAll { $0 == pendingKey }
                persistTokenMap(tokenMap)
                persistTokenList(tokenList)
                resolve(NSNull())
                return
            }
        }

        // 다음 사용 가능한 app_N 인덱스 산출
        let existingIndices = tokenList.compactMap { key -> Int? in
            guard key.hasPrefix("app_"), let n = Int(key.dropFirst(4)) else { return nil }
            return n
        }
        let nextIndex = (existingIndices.max() ?? -1) + 1
        let newKey = "app_\(nextIndex)"

        tokenMap.removeValue(forKey: pendingKey)
        tokenList.removeAll { $0 == pendingKey }

        tokenMap[newKey] = b64
        if !tokenList.contains(newKey) {
            tokenList.append(newKey)
        }

        persistTokenMap(tokenMap)
        persistTokenList(tokenList)
        resolve(newKey)
    }

    // MARK: - __cat_pending_{index}__ 토큰에 cat_N 키 부여 (중복 시 null 반환)

    @objc
    func confirmPendingCategoryAuto(
        _ index: NSInteger,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        var tokenMap  = loadTokenMap()
        var tokenList = loadTokenList()

        let pendingKey = "__cat_pending_\(index)__"
        guard let b64 = tokenMap[pendingKey] else {
            reject("NO_PENDING", "대기 중인 카테고리 토큰이 없어요.", nil); return
        }

        // 중복 검사: 기존 cat_ 키와 base64 비교
        for existingKey in tokenList where existingKey.hasPrefix("cat_") {
            if let existB64 = tokenMap[existingKey], existB64 == b64 {
                tokenMap.removeValue(forKey: pendingKey)
                tokenList.removeAll { $0 == pendingKey }
                persistTokenMap(tokenMap)
                persistTokenList(tokenList)
                resolve(NSNull())
                return
            }
        }

        let existingIndices = tokenList.compactMap { key -> Int? in
            guard key.hasPrefix("cat_"), let n = Int(key.dropFirst(4)) else { return nil }
            return n
        }
        let nextIndex = (existingIndices.max() ?? -1) + 1
        let newKey = "cat_\(nextIndex)"

        tokenMap.removeValue(forKey: pendingKey)
        tokenList.removeAll { $0 == pendingKey }
        tokenMap[newKey] = b64
        if !tokenList.contains(newKey) { tokenList.append(newKey) }

        persistTokenMap(tokenMap)
        persistTokenList(tokenList)
        resolve(newKey)
    }

    // MARK: - 앱 토큰 초기화

    @objc
    func clearAppTokens(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let std = UserDefaults.standard
        std.removeObject(forKey: kTokenMap)
        std.removeObject(forKey: kTokenList)
        std.removeObject(forKey: kAppMap)
        std.synchronize()
        defaults?.removeObject(forKey: kTokenMap)
        defaults?.removeObject(forKey: kTokenList)
        defaults?.removeObject(forKey: kAppMap)
        defaults?.synchronize()
        resolve(true)
    }

    // MARK: - 로그아웃 시 로컬 데이터 전체 삭제
    // 토큰 맵도 삭제: "어떤 앱을 추적하는지"는 유저별 설정이므로 계정 격리 필요
    // 부작용: 동일 계정 재로그인 시 앱 피커에서 다시 선택해야 함

    @objc
    func clearAllLocalData(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let stores: [UserDefaults?] = [defaults, UserDefaults.standard]
        for d in stores.compactMap({ $0 }) {
            // 추적 앱 토큰 (어떤 앱을 추적하는지 = 유저별)
            d.removeObject(forKey: kTokenMap)
            d.removeObject(forKey: kTokenList)
            d.removeObject(forKey: kAppMap)
            d.removeObject(forKey: kNameMap)
            // 오늘 사용량 버퍼
            for key in d.dictionaryRepresentation().keys where key.hasPrefix("ledger_usage_") {
                d.removeObject(forKey: key)
            }
            // 동기화 플래그 및 예산 맵
            d.removeObject(forKey: "ledger_sync_needed")
            d.removeObject(forKey: "ledger_budget_map")
            d.synchronize()
        }
        resolve(nil)
    }

    // MARK: - 이름 맵 저장 { "app_0": "유튜브" }

    @objc
    func setNameMap(
        _ json: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // 기존 맵과 머지 (기존 항목 유지, 새 항목 추가/업데이트)
        var existing = loadNameMap()
        if let data = json.data(using: .utf8),
           let incoming = try? JSONSerialization.jsonObject(with: data) as? [String: String] {
            for (k, v) in incoming { existing[k] = v }
        }
        if let data = try? JSONSerialization.data(withJSONObject: existing),
           let str  = String(data: data, encoding: .utf8) {
            defaults?.set(str, forKey: kNameMap)
            UserDefaults.standard.set(str, forKey: kNameMap)
            defaults?.synchronize()
        }
        resolve(nil)
    }

    // MARK: - 이름 맵 읽기

    @objc
    func getNameMap(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let map = loadNameMap()
        if let data = try? JSONSerialization.data(withJSONObject: map),
           let str  = String(data: data, encoding: .utf8) {
            resolve(str)
        } else {
            resolve("{}")
        }
    }

    // MARK: - 앱 토큰 하나 제거

    @objc
    func removeAppToken(
        _ appName: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        var tokenMap  = loadTokenMap()
        var tokenList = loadTokenList()
        // 이름 맵에서도 제거
        var nameMap = loadNameMap()
        nameMap.removeValue(forKey: appName)
        if let data = try? JSONSerialization.data(withJSONObject: nameMap),
           let str  = String(data: data, encoding: .utf8) {
            defaults?.set(str, forKey: kNameMap)
            UserDefaults.standard.set(str, forKey: kNameMap)
        }
        tokenMap.removeValue(forKey: appName)
        tokenList.removeAll { $0 == appName }
        persistTokenMap(tokenMap)
        persistTokenList(tokenList)
        resolve(true)
    }

    // MARK: - 모니터링 시작 (토큰 맵 기반)

    @objc
    func startMonitoring(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.0, *) else {
            reject("VERSION_ERROR", "iOS 16 이상에서만 사용 가능해요.", nil); return
        }

        let tokenList = loadTokenList()
        let tokenMap  = loadTokenMap()

        guard !tokenList.isEmpty else {
            reject("SETUP_ERROR", "추적할 앱이 없어요. 앱을 먼저 선택해주세요.", nil)
            return
        }

        // 토큰 목록이 동일하고 이미 모니터링 중이면 재시작 금지 (중복 카운팅 방지)
        let currentHash = tokenList.joined(separator: ",")
        let savedHash   = defaults?.string(forKey: "ledger_token_hash") ?? ""
        let center      = DeviceActivityCenter()
        if currentHash == savedHash && center.activities.contains(activityName) {
            resolve(true); return
        }

        // 하루 스케줄 (자정~23:59, 매일 반복)
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd:   DateComponents(hour: 23, minute: 59),
            repeats: true
        )

        // 오늘 이미 기록된 사용량 로드 (이미 지나간 임계값은 등록 생략)
        // ledger_usage_{date}의 키는 표시 이름(유튜브 등)이므로 name_map으로 변환해서 조회
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        let todayStr = fmt.string(from: Date())
        var todayUsage: [String: Int] = [:]
        if let json = defaults?.string(forKey: "ledger_usage_\(todayStr)"),
           let data = json.data(using: .utf8),
           let map  = try? JSONSerialization.jsonObject(with: data) as? [String: Int] {
            todayUsage = map
        }
        let nameMap = loadNameMap()  // { "app_0": "유튜브" }

        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        var appMapDict: [String: String] = [:]
        var appIndex = 0
        var catIndex = 0

        for appKey in tokenList {
            guard let b64 = tokenMap[appKey],
                  let data = Data(base64Encoded: b64),
                  let sel  = try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
            else { continue }

            if let token = sel.applicationTokens.first {
                appMapDict[String(appIndex)] = appKey
                // todayUsage 키는 표시 이름 — token key가 아닌 display name으로 조회
                let displayName = nameMap[appKey] ?? appKey
                let recorded = todayUsage[displayName] ?? 0
                let startMins = ((recorded / 10) + 1) * 10
                for mins in stride(from: startMins, through: 720, by: 10) {
                    let name = DeviceActivityEvent.Name("idx_\(appIndex)_t\(mins)")
                    events[name] = DeviceActivityEvent(
                        applications: [token],
                        threshold:    DateComponents(minute: mins)
                    )
                }
                appIndex += 1
            } else if let catToken = sel.categoryTokens.first {
                appMapDict["cat_\(catIndex)"] = appKey
                let displayName = nameMap[appKey] ?? appKey
                let recorded = todayUsage[displayName] ?? 0
                let startMins = ((recorded / 10) + 1) * 10
                for mins in stride(from: startMins, through: 720, by: 10) {
                    let name = DeviceActivityEvent.Name("cat_\(catIndex)_t\(mins)")
                    events[name] = DeviceActivityEvent(
                        categories: [catToken],
                        threshold:  DateComponents(minute: mins)
                    )
                }
                catIndex += 1
            }
        }

        guard appIndex + catIndex > 0 else {
            reject("DECODE_ERROR", "유효한 앱/카테고리 토큰을 읽지 못했어요. 다시 선택해주세요.", nil)
            return
        }

        // app_map 동기화 (Extension이 읽을 수 있도록)
        if let data = try? JSONSerialization.data(withJSONObject: appMapDict),
           let json = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(json, forKey: kAppMap)
            defaults?.set(json, forKey: kAppMap)
        }

        center.stopMonitoring([activityName])

        do {
            try center.startMonitoring(activityName, during: schedule, events: events)
            // 재시작 기준 hash 저장 (동일 목록 재진입 시 skip에 사용)
            defaults?.set(currentHash, forKey: "ledger_token_hash")
            defaults?.synchronize()
            resolve(true)
        } catch {
            reject("MONITOR_ERROR", "모니터링 시작 실패: \(error.localizedDescription)", error)
        }
    }

    // MARK: - 모니터링 중지

    @objc
    func stopMonitoring(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.0, *) else { resolve(false); return }
        DeviceActivityCenter().stopMonitoring([activityName])
        resolve(true)
    }

    // MARK: - 예산 맵 동기화 (Extension 백그라운드 알림용)
    // JSON 형식: { "app_0": { "budget": 60, "display": "YouTube" }, ... }

    @objc
    func syncBudgetMap(
        _ json: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        defaults?.set(json, forKey: "ledger_budget_map")
        defaults?.synchronize()
        resolve(true)
    }

    // MARK: - 일일 사용량 읽기

    @objc
    func getDailyUsage(
        _ dateStr: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let key = "ledger_usage_\(dateStr)"
        guard let json = defaults?.string(forKey: key),
              let data = json.data(using: .utf8),
              let map  = try? JSONSerialization.jsonObject(with: data) as? [String: Int] else {
            resolve("[]"); return
        }

        let nameMap = loadNameMap()

        let result = map.map { tokenKey, mins -> [String: Any] in
            // 토큰 키를 사용자 입력 이름으로 변환 (없으면 토큰 키 그대로)
            let displayName = nameMap[tokenKey] ?? tokenKey
            return ["app_name": displayName, "bundle_id": "", "duration_minutes": mins]
        }
        if let encoded = try? JSONSerialization.data(withJSONObject: result),
           let str = String(data: encoded, encoding: .utf8) {
            resolve(str)
        } else {
            resolve("[]")
        }
    }

    // MARK: - 동기화 완료된 날짜의 UserDefaults 버퍼 삭제

    @objc
    func clearDailyUsage(
        _ dateStr: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        defaults?.removeObject(forKey: "ledger_usage_\(dateStr)")
        resolve(nil)
    }

    // MARK: - 모니터링 상태 조회

    @objc
    func getMonitoringStatus(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let tokenList = loadTokenList()
        let appMap    = UserDefaults.standard.string(forKey: kAppMap)
                     ?? defaults?.string(forKey: kAppMap)
                     ?? "{}"

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        let today = fmt.string(from: Date())

        let todayUsage = defaults?.string(forKey: "ledger_usage_\(today)") ?? "{}"
        let syncNeeded = defaults?.string(forKey: "ledger_sync_needed")

        let result: [String: Any] = [
            "hasSelection": !tokenList.isEmpty,
            "appList": tokenList,
            "appMap": appMap,
            "todayUsage": todayUsage,
            "syncNeeded": syncNeeded as Any,
            "date": today,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: result),
           let json = String(data: data, encoding: .utf8) {
            resolve(json)
        } else {
            resolve("{}")
        }
    }

    // MARK: - Sync 플래그

    @objc
    func checkSyncNeeded(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(defaults?.string(forKey: "ledger_sync_needed") as Any)
    }

    @objc
    func clearSyncNeeded(
        _ resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        defaults?.removeObject(forKey: "ledger_sync_needed")
        defaults?.synchronize()
        resolve(true)
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }

    // MARK: - Private: 현재 최상위 VC 탐색

    private static func topmostViewController() -> UIViewController? {
        guard let root = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        else { return nil }

        var top = root
        while let presented = top.presentedViewController {
            top = presented
        }
        return top
    }

    // MARK: - Private: 토큰 저장

    @available(iOS 16.0, *)
    private func saveTokenForApp(appName: String, selection: FamilyActivitySelection) {
        guard let data = try? PropertyListEncoder().encode(selection) else { return }
        let b64 = data.base64EncodedString()

        var tokenMap  = loadTokenMap()
        var tokenList = loadTokenList()

        tokenMap[appName] = b64
        if !tokenList.contains(appName) {
            tokenList.append(appName)
        }

        persistTokenMap(tokenMap)
        persistTokenList(tokenList)
    }

    private func loadTokenMap() -> [String: String] {
        guard let json = UserDefaults.standard.string(forKey: kTokenMap)
                      ?? defaults?.string(forKey: kTokenMap),
              let data = json.data(using: .utf8),
              let map  = try? JSONSerialization.jsonObject(with: data) as? [String: String]
        else { return [:] }
        return map
    }

    private func loadTokenList() -> [String] {
        guard let json = UserDefaults.standard.string(forKey: kTokenList)
                      ?? defaults?.string(forKey: kTokenList),
              let data = json.data(using: .utf8),
              let list = try? JSONSerialization.jsonObject(with: data) as? [String]
        else { return [] }
        return list
    }

    private func loadNameMap() -> [String: String] {
        guard let json = defaults?.string(forKey: kNameMap)
                      ?? UserDefaults.standard.string(forKey: kNameMap),
              let data = json.data(using: .utf8),
              let map  = try? JSONSerialization.jsonObject(with: data) as? [String: String]
        else { return [:] }
        return map
    }

    private func persistTokenMap(_ map: [String: String]) {
        guard let data = try? JSONSerialization.data(withJSONObject: map),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(json, forKey: kTokenMap)
        UserDefaults.standard.synchronize()
        defaults?.set(json, forKey: kTokenMap)
        defaults?.synchronize()
    }

    private func persistTokenList(_ list: [String]) {
        guard let data = try? JSONSerialization.data(withJSONObject: list),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(json, forKey: kTokenList)
        UserDefaults.standard.synchronize()
        defaults?.set(json, forKey: kTokenList)
        defaults?.synchronize()
    }
}

// MARK: - FamilyActivityPicker 호스팅 ViewController

@available(iOS 16.0, *)
class AppPickerHostingController: UIViewController, UIAdaptivePresentationControllerDelegate {
    private let pickerTitle:  String
    private let onComplete:   (FamilyActivitySelection) -> Void
    private let onCancel:     () -> Void
    private var selection = FamilyActivitySelection()
    private var didFinish = false

    init(
        title:      String = "추적할 앱 선택",
        onComplete: @escaping (FamilyActivitySelection) -> Void,
        onCancel:   @escaping () -> Void
    ) {
        self.pickerTitle = title
        self.onComplete  = onComplete
        self.onCancel    = onCancel
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        presentationController?.delegate = self
        let pickerView = PickerWrapperView(
            title:     pickerTitle,
            selection: Binding(get: { self.selection }, set: { self.selection = $0 }),
            onDone:   { [weak self] in self?.handleDone() },
            onCancel: { [weak self] in self?.handleCancel() }
        )
        let host = UIHostingController(rootView: pickerView)
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func handleDone() {
        guard !didFinish else { return }
        didFinish = true
        dismiss(animated: true) { [self] in onComplete(selection) }
    }

    private func handleCancel() {
        guard !didFinish else { return }
        didFinish = true
        dismiss(animated: true) { [self] in onCancel() }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !didFinish else { return }
        didFinish = true
        onCancel()
    }
}

@available(iOS 16.0, *)
private struct PickerWrapperView: View {
    let title: String
    @Binding var selection: FamilyActivitySelection
    let onDone:   () -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationView {
            FamilyActivityPicker(selection: $selection)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("취소", action: onCancel)
                    }
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button("완료", action: onDone)
                            .fontWeight(.semibold)
                    }
                }
        }
    }
}
