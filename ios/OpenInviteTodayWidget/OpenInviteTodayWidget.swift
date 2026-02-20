//
//  OpenInviteTodayWidget.swift
//  OpenInviteTodayWidget
//
//  Open Invite Lock Screen Widget — Hybrid B+C
//  Shows stacked summary + smart next event via timeline refresh.
//

import WidgetKit
import SwiftUI

// MARK: - Event Model (matches frontend contract)

struct WidgetEvent: Codable, Identifiable {
    let id: String
    let title: String
    let startAt: Date
    let viewerRsvpStatus: String?
    let visibility: String?
    let circleName: String?
}

// MARK: - Timeline Entry

struct TodayEntry: TimelineEntry {
    let date: Date
    let eventCount: Int
    let nextEvent: WidgetEvent?
}

// MARK: - Shared Data Store (App Group UserDefaults)

struct SharedEventStore {
    static let suiteName = "group.com.vibecode.openinvite.0qi5wk"
    static let storeKey = "oi_today_events_v1"

    static func loadTodayEvents() -> [WidgetEvent] {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: storeKey) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([WidgetEvent].self, from: data)) ?? []
    }
}

// MARK: - Hybrid Summary Logic

func computeTodaySummary(events: [WidgetEvent]) -> (count: Int, nextEvent: WidgetEvent?) {
    let calendar = Calendar.current
    let now = Date()

    let filtered = events.filter { event in
        // Same calendar day (local timezone)
        guard calendar.isDateInToday(event.startAt) else { return false }
        // Future only
        guard event.startAt >= now else { return false }
        // Exclude declined
        if event.viewerRsvpStatus == "not_going" { return false }
        return true
    }
    .sorted { $0.startAt < $1.startAt }

    return (count: filtered.count, nextEvent: filtered.first)
}

// MARK: - Timeline Provider

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, eventCount: 3, nextEvent: WidgetEvent(
            id: "preview-event",
            title: "Dinner with friends",
            startAt: Date(),
            viewerRsvpStatus: "going",
            visibility: nil,
            circleName: nil
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let events = SharedEventStore.loadTodayEvents()
        let summary = computeTodaySummary(events: events)
        let entry = TodayEntry(date: .now, eventCount: summary.count, nextEvent: summary.nextEvent)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let events = SharedEventStore.loadTodayEvents()
        let summary = computeTodaySummary(events: events)

        let entry = TodayEntry(date: .now, eventCount: summary.count, nextEvent: summary.nextEvent)

        // Refresh every 30 minutes — battery safe, feels alive
        let refreshDate = Date().addingTimeInterval(30 * 60)
        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }
}

// MARK: - Lock Screen UI (Accessory Rectangular)

struct OpenInviteTodayWidgetEntryView: View {
    var entry: TodayEntry

    var body: some View {
        HStack(spacing: 6) {
            // RSVP indicator dot
            if let status = entry.nextEvent?.viewerRsvpStatus {
                Circle()
                    .fill(status == "going" ? Color.green : Color.gray)
                    .frame(width: 6, height: 6)
            }

            VStack(alignment: .leading, spacing: 2) {
                if entry.eventCount == 0 {
                    Text("You're free today")
                        .font(.headline)
                        .lineLimit(1)
                    Text("No events scheduled")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if entry.eventCount == 1, let event = entry.nextEvent {
                    Text(event.title)
                        .font(.headline)
                        .lineLimit(1)
                    Text("Today • \(formatTime(event.startAt))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if let event = entry.nextEvent {
                    Text("\(entry.eventCount) events today")
                        .font(.headline)
                        .lineLimit(1)
                    Text("Next: \(event.title) • \(formatTime(event.startAt))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }
}

// MARK: - Widget Configuration

struct OpenInviteTodayWidget: Widget {
    let kind: String = "OpenInviteTodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                OpenInviteTodayWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                OpenInviteTodayWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Open Invite — Today")
        .description("See your social events for today at a glance.")
        .supportedFamilies([.accessoryRectangular])
    }
}

// MARK: - Widget Bundle (entry point)

@main
struct OpenInviteTodayWidgetBundle: WidgetBundle {
    var body: some Widget {
        OpenInviteTodayWidget()
    }
}

#if DEBUG
struct OpenInviteTodayWidget_Previews: PreviewProvider {
    static var previews: some View {
        OpenInviteTodayWidgetEntryView(entry: TodayEntry(
            date: .now,
            eventCount: 3,
            nextEvent: WidgetEvent(
                id: "preview",
                title: "Dinner with friends",
                startAt: Date().addingTimeInterval(3600),
                viewerRsvpStatus: "going",
                visibility: nil,
                circleName: nil
            )
        ))
        .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
    }
}
#endif
