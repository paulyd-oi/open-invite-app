/**
 * WidgetBridgeModule — React Native → iOS native bridge
 *
 * Exposes two methods to JS:
 *   setTodayWidgetPayload(jsonString) — writes to App Group UserDefaults
 *   reloadTodayWidget()              — reloads WidgetKit timelines
 *
 * Registered as "WidgetBridge" in NativeModules.
 */

import Foundation
import WidgetKit

@objc(WidgetBridge)
class WidgetBridgeModule: NSObject {

    private let appGroup = "group.com.vibecode.openinvite.0qi5wk"
    private let payloadKey = "todayWidgetPayload_v1"
    private let widgetKind = "OpenInviteTodayWidget"

    @objc
    func setTodayWidgetPayload(_ jsonString: String,
                                resolver resolve: @escaping RCTPromiseResolveBlock,
                                rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            reject("ERR_APP_GROUP", "Could not access App Group UserDefaults", nil)
            return
        }
        defaults.set(jsonString, forKey: payloadKey)
        defaults.synchronize()
        resolve(true)
    }

    @objc
    func reloadTodayWidget(_ resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
            resolve(true)
        } else {
            // WidgetKit not available on iOS < 14
            resolve(false)
        }
    }

    /// Required for RN native module on main queue
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
