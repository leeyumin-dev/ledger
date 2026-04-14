//
//  DeviceActivityMonitorExtension.swift
//  LedgerMonitor
//

import DeviceActivity
import Foundation
import os.log

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
              let idx = Int(parts[1]) else { return }

        let prefix = String(parts[0])  // "idx" or "cat"
        // ledger_app_map 키: 앱 토큰 → "0","1"..., 카테고리 → "cat_0","cat_1"...
        let lookupKey = prefix == "idx" ? String(idx) : "cat_\(idx)"

        let today = currentDateString()

        guard let mapJson = defaults?.string(forKey: "ledger_app_map"),
              let mapData = mapJson.data(using: .utf8),
              let map = try? JSONSerialization.jsonObject(with: mapData) as? [String: String],
              let appName = map[lookupKey] else {
            logger.warning("app_map에서 \(lookupKey) 조회 실패")
            return
        }

        let usageKey = "ledger_usage_\(today)"
        var usage = currentUsage(for: usageKey)
        usage[appName] = (usage[appName] ?? 0) + 5
        saveUsage(usage, forKey: usageKey)
        logger.info("\(appName) += 5분 → 합계 \(usage[appName] ?? 0)분")
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
