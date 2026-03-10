//
//  OpenInviteEventAttributes.swift
//  Shared between OpenInvite (main app) and OpenInviteTodayWidgetExtension
//
//  ActivityKit attributes for Live Activity event tracking.
//  This file MUST be included in both the app and widget extension targets.
//

import Foundation
import ActivityKit

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

    /// Computed start Date for use in SwiftUI timer views.
    var startDate: Date {
        Date(timeIntervalSince1970: startTimeEpoch)
    }
}
