//
//  OpenInviteEventAttributes.swift
//  Shared between OpenInvite (main app) and OpenInviteTodayWidgetExtension
//
//  ActivityKit attributes for Live Activity event tracking.
//  This file MUST be included in both the app and widget extension targets.
//

import Foundation
import ActivityKit
import SwiftUI

@available(iOS 16.1, *)
struct OpenInviteEventAttributes: ActivityAttributes {
    /// Dynamic data updated during the activity lifecycle
    public struct ContentState: Codable, Hashable {
        /// RSVP status: "going", "interested", "not_going"
        var rsvpStatus: String
        /// Whether the event has ended
        var ended: Bool
        /// Current going count (updated with activity)
        var goingCount: Int
    }

    /// Event ID for deep linking back to event detail
    var eventId: String
    /// Event title
    var eventTitle: String
    /// Event start time as Unix timestamp (seconds since epoch).
    /// Used by Text(timerInterval:) for OS-driven live countdown.
    var startTimeEpoch: Double
    /// Optional location name
    var locationName: String?
    /// Event emoji (e.g. "🎉") — shown on Lock Screen for personality
    var emoji: String?
    /// Theme accent color as hex string (e.g. "#FF6B4A") for premium tint
    var themeAccentColor: String?

    /// Computed start Date for use in SwiftUI timer views.
    var startDate: Date {
        Date(timeIntervalSince1970: startTimeEpoch)
    }

    /// Parsed accent Color, falling back to app primary (#FF6B4A)
    var accentColor: Color {
        guard let hex = themeAccentColor, hex.count >= 7 else {
            return Color(red: 1.0, green: 0.42, blue: 0.29) // #FF6B4A
        }
        let r, g, b: Double
        let start = hex.index(hex.startIndex, offsetBy: 1)
        let hexColor = String(hex[start...])
        guard hexColor.count == 6, let val = UInt64(hexColor, radix: 16) else {
            return Color(red: 1.0, green: 0.42, blue: 0.29)
        }
        r = Double((val >> 16) & 0xFF) / 255.0
        g = Double((val >> 8) & 0xFF) / 255.0
        b = Double(val & 0xFF) / 255.0
        return Color(red: r, green: g, blue: b)
    }
}
