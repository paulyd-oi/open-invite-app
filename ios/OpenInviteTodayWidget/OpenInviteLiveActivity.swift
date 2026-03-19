//
//  OpenInviteLiveActivity.swift
//  OpenInviteTodayWidget
//
//  Live Activity V3 — premium themed Lock Screen and Dynamic Island.
//  Dark gradient background with theme accent tint, status pill,
//  dominant title, and clean metadata hierarchy.
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
                    VStack(alignment: .center, spacing: 3) {
                        Text(context.attributes.eventTitle)
                            .font(.system(.headline, design: .rounded))
                            .fontWeight(.semibold)
                            .lineLimit(1)
                        expandedCountdown(context: context)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let loc = context.attributes.locationName {
                            Text(loc)
                                .font(.caption2)
                                .lineLimit(1)
                                .foregroundStyle(.tertiary)
                        }
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.goingCount > 0 {
                        Text("\(context.state.goingCount)")
                            .font(.system(.caption, design: .rounded))
                            .fontWeight(.medium)
                            .foregroundStyle(context.attributes.accentColor)
                            .padding(.trailing, 4)
                    }
                }
            } compactLeading: {
                emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
            } compactTrailing: {
                compactCountdown(context: context, accent: context.attributes.accentColor)
            } minimal: {
                emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
            }
        }
    }

    // MARK: - Lock Screen View (V3 — premium themed card)

    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        let accent = context.attributes.accentColor

        Link(destination: URL(string: "open-invite://event/\(context.attributes.eventId)")!) {
            VStack(alignment: .leading, spacing: 10) {
                // Row 1: Status pill
                HStack {
                    statusPill(context: context, accent: accent)
                    Spacer(minLength: 0)
                    // Emoji badge (top-right)
                    emojiOrDot(emoji: context.attributes.emoji, status: context.state.rsvpStatus)
                        .frame(width: 28, height: 28)
                        .background(
                            Circle()
                                .fill(accent.opacity(0.15))
                        )
                }

                // Row 2: Event title (dominant)
                Text(context.attributes.eventTitle)
                    .font(.system(.title3, design: .rounded))
                    .fontWeight(.bold)
                    .lineLimit(2)
                    .foregroundStyle(.white)

                // Row 3: Secondary metadata
                HStack(spacing: 6) {
                    if let loc = context.attributes.locationName {
                        Image(systemName: "mappin")
                            .font(.caption2)
                            .foregroundStyle(accent.opacity(0.8))
                        Text(loc)
                            .lineLimit(1)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }

                    if context.state.goingCount > 0 {
                        if context.attributes.locationName != nil {
                            Text("·")
                                .foregroundStyle(.white.opacity(0.35))
                        }
                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                            .foregroundStyle(accent.opacity(0.8))
                        Text("\(context.state.goingCount) going")
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(
                // Dark gradient with theme accent tint at top
                LinearGradient(
                    colors: [
                        accent.opacity(0.18),
                        Color.black.opacity(0.85),
                        Color.black.opacity(0.92)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
        .activityBackgroundTint(.black)
    }

    // MARK: - Status Pill

    @ViewBuilder
    private func statusPill(context: ActivityViewContext<OpenInviteEventAttributes>, accent: Color) -> some View {
        if context.state.ended {
            pillLabel(text: "Ended", accent: .white.opacity(0.5))
        } else if context.attributes.startDate > Date.now {
            // Future: show countdown in pill
            HStack(spacing: 4) {
                Image(systemName: "clock.fill")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(accent)
                Text(timerInterval: Date.now...context.attributes.startDate, countsDown: true)
                    .monospacedDigit()
                    .font(.system(.caption2, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule()
                            .strokeBorder(accent.opacity(0.35), lineWidth: 0.5)
                    )
            )
        } else {
            pillLabel(text: "Happening now", accent: .green)
        }
    }

    @ViewBuilder
    private func pillLabel(text: String, accent: Color) -> some View {
        Text(text)
            .font(.system(.caption2, design: .rounded))
            .fontWeight(.semibold)
            .foregroundStyle(accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Capsule()
                            .strokeBorder(accent.opacity(0.35), lineWidth: 0.5)
                    )
            )
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

    // MARK: - Dynamic Island Helpers

    @ViewBuilder
    private func expandedCountdown(context: ActivityViewContext<OpenInviteEventAttributes>) -> some View {
        if context.state.ended {
            Text("Ended")
        } else if context.attributes.startDate > Date.now {
            Text(timerInterval: Date.now...context.attributes.startDate, countsDown: true)
                .monospacedDigit()
        } else {
            Text("Happening now")
                .foregroundStyle(.green)
        }
    }

    @ViewBuilder
    private func compactCountdown(context: ActivityViewContext<OpenInviteEventAttributes>, accent: Color) -> some View {
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
                .font(.system(.caption2, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(accent)
        }
    }
}
