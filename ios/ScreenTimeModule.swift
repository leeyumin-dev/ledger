//
//  ScreenTimeModule.swift
//  ledger
//
//  Created by 이유민 on 3/27/26.
//

import Foundation
import FamilyControls
import DeviceActivity
import ManagedSettings

@objc(ScreenTimeModule)
class ScreenTimeModule: NSObject {
  
  @objc
  func requestAuthorization(_ resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.0, *) {
      Task {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          resolve("authorized")
        } catch {
          reject("AUTH_ERROR", error.localizedDescription, error)
        }
      }
    } else {
      reject("VERSION_ERROR", "iOS 16 이상에서만 사용 가능해요.", nil)
    }
  }
  
  @objc
  func getUsageData(_ date: String,
                    resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 16.0, *) {
      let formatter = DateFormatter()
      formatter.dateFormat = "yyyy-MM-dd"

      guard let targetDate = formatter.date(from: date) else {
        reject("DATE_ERROR", "Invalid date format", nil)
        return
      }

      let calendar = Calendar.current
      let _ = DateInterval(
        start: calendar.startOfDay(for: targetDate),
        end: calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: targetDate))!
      )

      resolve([])
    } else {
      reject("VERSION_ERROR", "iOS 16 이상에서만 사용 가능해요.", nil)
    }
  }
  
  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
