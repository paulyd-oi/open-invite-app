//
//  OpenInviteLiveActivity.swift
//  OpenInviteTodayWidget
//
//  Live Activity for tracking an active event on the Lock Screen
//  and Dynamic Island. Shows event title, live countdown, and RSVP status.
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
                    rsvpDot(status: context.state.rsvpStatus)
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
                rsvpDot(status: context.state.rsvpStatus)
            } compactTrailing: {
                compactCountdown(context: context)
            } minimal: {
                rsvpDot(status: context.state.rsvpStatus)
            }
        }
    }

    // MARK: - Lock Screen View

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        HStack(spacing: 12) {
            rsvpDot(status: context.state.rsvpStatus)

            VStack(alignment: .leading, spacing: 2) {
                Text(context.attributes.eventTitle)
                    .font(.headline)
                    .lineLimit(1)

                if context.state.ended {
                    Text("Event ended")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    HStack(spacing: 4) {
                        liveCountdown(startDate: context.attributes.startDate)
                        if let loc = context.attributes.locationName {
                            Text("•")
                                .foregroundStyle(.secondary)
                            Text(loc)
                                .lineLimit(1)
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
            }

            Spacer(minLength: 0)

            // Deep link arrow
            Link(destination: URL(string: "open-invite://event/\(context.attributes.eventId)")!) {
                Image(systemName: "chevron.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .activityBackgroundTint(.black.opacity(0.75))
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

    @ViewBuilder
    private func rsvpDot(status: String) -> some View {
        Circle()
            .fill(status == "going" ? Color.green : Color.orange)
            .frame(width: 8, height: 8)
    }
}
