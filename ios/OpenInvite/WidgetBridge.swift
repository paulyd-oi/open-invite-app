//
//  WidgetBridge.swift
//  OpenInvite
//
//  Native bridge: writes today-events JSON to App Group shared UserDefaults
//  so the WidgetKit extension can read it without network calls.
//

import Foundation
import React
import WidgetKit

@objc(WidgetBridge)
class WidgetBridge: NSObject {

    static let suiteName = "group.com.vibecode.openinvite.0qi5wk"
    static let storeKey = "oi_today_events_v1"

    @objc
    func updateEvents(_ eventsJson: String) {
        guard let defaults = UserDefaults(suiteName: WidgetBridge.suiteName) else { return }
        guard let data = eventsJson.data(using: .utf8) else { return }
        defaults.set(data, forKey: WidgetBridge.storeKey)
        defaults.synchronize()

        // Reload widget timelines so it picks up new data
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
