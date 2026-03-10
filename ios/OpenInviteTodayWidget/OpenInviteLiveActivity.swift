//
//  OpenInviteLiveActivity.swift
//  OpenInviteTodayWidget
//
//  Live Activity V2 for tracking an active event on the Lock Screen
//  and Dynamic Island. Two-line layout with emoji, attendance, and location.
//
//  Countdown uses Text(timerInterval:countsDown:) — the OS clock drives
//  the display. No app updates needed to keep the timer ticking.
//

import ActivityKit
import WidgetKit
import SwiftUI

// OpenInviteEventAttributes is defined in Shared/OpenInviteEventAttributes.swift
// and included in both app and widget extension targets.

// MARK: - Live Activity Widget (iOS 16.1+)

@available(iOS 16.1, *)
struct OpenInviteLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OpenInviteEventAttributes.self) { context in
            // Lock Screen / Banner presentation
            lockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .center, spacing: 2) {
                        Text(context.attributes.eventTitle)
                            .font(.headline)
                            .lineLimit(1)
                        expandedCountdown(context: context)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let loc = context.attributes.locationName {
                        Text(loc)
                            .font(.caption2)
                            .lineLimit(1)
                            .foregroundStyle(.secondary)
                            .padding(.trailing, 4)
                    }
                }
            } compactLeading: {
                emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
            } compactTrailing: {
                compactCountdown(context: context)
            } minimal: {
                emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
            }
        }
    }

    // MARK: - Lock Screen View (V2 — two-line hierarchy)

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        Link(destination: URL(string: "open-invite://event/\(context.attributes.eventId)")!) {
            HStack(spacing: 12) {
                // Left: emoji badge or status dot
                emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(context.state.rsvpStatus == "going" ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
                    )

                // Center: two-line info
                VStack(alignment: .leading, spacing: 3) {
                    // Line 1: Event title
                    Text(context.attributes.eventTitle)
                        .font(.system(.headline, design: .rounded))
                        .fontWeight(.semibold)
                        .lineLimit(1)
                        .foregroundStyle(.white)

                    // Line 2: Status + location + attendance
                    if context.state.ended {
                        Text("Event ended")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        HStack(spacing: 6) {
                            liveCountdown(startDate: context.attributes.startDate)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            if let loc = context.attributes.locationName {
                                Text("•")
                                    .foregroundStyle(.tertiary)
                                Text(loc)
                                    .lineLimit(1)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }

                            if context.state.goingCount > 0 {
                                Text("•")
                                    .foregroundStyle(.tertiary)
                                Text("\(context.state.goingCount) going")
                                    .font(.subheadline)
                                    .foregroundStyle(Color.green)
                            }
                        }
                    }
                }

                Spacer(minLength: 0)

                // Right: chevron indicator
                Image(systemName: "chevron.right.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.white.opacity(0.6))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
        }
        .activityBackgroundTint(.black.opacity(0.8))
    }

    // MARK: - Emoji or RSVP dot

    @ViewBuilder
    private func emojiOrDot(emoji: String?, status: String) -> some View {
        if let emoji = emoji, !emoji.isEmpty {
            Text(emoji)
                .font(.system(size: 18))
        } else {
            Circle()
                .fill(status == "going" ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
        }
    }

    // MARK: - Live Countdown (OS-driven timer)

    /// Uses Text(timerInterval:countsDown:) — the OS clock auto-decrements
    /// the display without any app updates. Stops at 0:00 when the event starts.
    @ViewBuilder
    private func liveCountdown(startDate: Date) -> some View {
        if startDate > Date.now {
            // Future: show live countdown driven by OS clock
            Text(timerInterval: Date.now...startDate, countsDown: true)
                .monospacedDigit()
        } else {
            // Past start time: show "Happening now" (static until next update)
            Text("Happening now")
                .foregroundStyle(.green)
        }
    }

    // MARK: - Dynamic Island Helpers

    @ViewBuilder
    private func expandedCountdown(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        if context.state.ended {
            Text("Ended")
        } else {
            liveCountdown(startDate: context.attributes.startDate)
        }
    }

    @ViewBuilder
    private func compactCountdown(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        if context.state.ended {
            Text("Done")
                .font(.caption2)
        } else if context.attributes.startDate > Date.now {
            Text(timerInterval: Date.now...context.attributes.startDate, countsDown: true)
                .monospacedDigit()
                .font(.caption2)
                .frame(width: 40)
        } else {
            Text("Now")
                .font(.caption2)
                .foregroundStyle(.green)
        }
    }
}
