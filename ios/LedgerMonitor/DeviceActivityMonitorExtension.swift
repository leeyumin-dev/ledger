//
//  DeviceActivityMonitorExtension.swift
//  LedgerMonitor
//

import DeviceActivity
import Foundation
import os.log
import UserNotifications

private let appGroupId = "group.com.leeyoumin.ledger"
private let logger = Logger(subsystem: appGroupId, category: "LedgerMonitor")

class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    private var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // MARK: - 하루 시작

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        logger.info("intervalDidStart: \(activity.rawValue)")
    }

    // MARK: - 하루 종료 → sync_needed 플래그 설정

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        let today = currentDateString()
        defaults?.set(today, forKey: "ledger_sync_needed")
        defaults?.synchronize()
        logger.info("intervalDidEnd: sync_needed = \(today)")
    }

    // MARK: - 임계값 도달 (앱 사용 5분 단위 카운팅)
    //
    // 이벤트 이름 형식: "idx_{앱인덱스}_t{누적분}"
    // 예: "idx_0_t5", "idx_0_t10", "idx_1_t5" ...

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)
        logger.info("threshold: \(event.rawValue)")

        // 이벤트 이름 형식:
        //   개별 앱:   "idx_0_t5",  "idx_1_t10" ...
        //   카테고리:  "cat_0_t5",  "cat_1_t10" ...
        let parts = event.rawValue.split(separator: "_")
        guard parts.count == 3,
              (parts[0] == "idx" || parts[0] == "cat"),
              let idx = Int(parts[1]),
              let tMins = Int(parts[2].dropFirst())  // "t180" → 180
        else { return }

        let prefix = String(parts[0])  // "idx" or "cat"
        // ledger_app_map 키: 앱 토큰 → "0","1"..., 카테고리 → "cat_0","cat_1"...
        let lookupKey = prefix == "idx" ? String(idx) : "cat_\(idx)"

        let today = currentDateString()

        guard let mapJson = defaults?.string(forKey: "ledger_app_map"),
              let mapData = mapJson.data(using: .utf8),
              let map = try? JSONSerialization.jsonObject(with: mapData) as? [String: String],
              let tokenKey = map[lookupKey] else {
            logger.warning("app_map에서 \(lookupKey) 조회 실패")
            return
        }

        // 토큰 키 → 사용자 입력 이름으로 변환
        let appName: String
        if let nameJson = defaults?.string(forKey: "ledger_name_map"),
           let nameData = nameJson.data(using: .utf8),
           let nameMap  = try? JSONSerialization.jsonObject(with: nameData) as? [String: String],
           let displayName = nameMap[tokenKey] {
            appName = displayName
        } else {
            appName = tokenKey
        }

        let usageKey = "ledger_usage_\(today)"
        var usage = currentUsage(for: usageKey)
        let prev = usage[appName] ?? 0
        guard tMins > prev else {
            // 이미 더 높은 임계값이 기록돼 있으면 무시 (재시작 후 재발화 방지)
            logger.info("\(appName) t\(tMins) skipped (already \(prev)분)")
            return
        }
        usage[appName] = tMins
        saveUsage(usage, forKey: usageKey)
        logger.info("\(appName) = \(tMins)분 (이전 \(prev)분)")

        // 예산 초과 알림 체크
        checkBudgetAndNotify(appName: appName, usedMins: tMins, date: today)
    }

    // MARK: - 예산 초과 알림

    private func checkBudgetAndNotify(appName: String, usedMins: Int, date: String) {
        guard let json = defaults?.string(forKey: "ledger_budget_map"),
              let data = json.data(using: .utf8),
              let map  = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]],
              let entry = map[appName],
              let budgetMins = entry["budget"] as? Int,
              budgetMins > 0,
              usedMins >= budgetMins
        else { return }

        // 오늘 이미 이 앱에 대해 알림 보냈으면 skip
        let notifKey = "ledger_notif_sent_\(date)_\(appName)"
        if defaults?.bool(forKey: notifKey) == true { return }
        defaults?.set(true, forKey: notifKey)
        defaults?.synchronize()

        let displayName = entry["display"] as? String
        let label = displayName?.isEmpty == false ? displayName! : appName

        let budgetStr  = formatMins(budgetMins)
        let usedStr    = formatMins(usedMins)

        let content = UNMutableNotificationContent()
        content.title = "⚠️ \(label) 예산 초과"
        content.body  = "오늘 \(budgetStr) 배정 중 \(usedStr)을 사용했어요."
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "ledger_budget_\(appName)_\(date)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                logger.warning("알림 발송 실패: \(error.localizedDescription)")
            }
        }
        logger.info("\(appName) 예산 초과 알림 발송: \(usedMins)/\(budgetMins)분")
    }

    private func formatMins(_ mins: Int) -> String {
        let h = mins / 60
        let m = mins % 60
        if h == 0 { return "\(m)m" }
        if m == 0 { return "\(h)h" }
        return "\(h)h \(m)m"
    }

    // MARK: - 헬퍼

    private func currentDateString() -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        return fmt.string(from: Date())
    }

    private func currentUsage(for key: String) -> [String: Int] {
        guard let json = defaults?.string(forKey: key),
              let data = json.data(using: .utf8),
              let map = try? JSONSerialization.jsonObject(with: data) as? [String: Int]
        else { return [:] }
        return map
    }

    private func saveUsage(_ usage: [String: Int], forKey key: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: usage),
              let json = String(data: data, encoding: .utf8) else { return }
        defaults?.set(json, forKey: key)
        defaults?.synchronize()
    }
}
