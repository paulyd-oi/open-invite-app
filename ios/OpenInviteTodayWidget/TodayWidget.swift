/**
 * OpenInviteTodayWidget — iOS WidgetKit Extension
 *
 * Reads TodayWidgetPayloadV1 JSON from App Group UserDefaults
 * and renders Small / Medium widget families.
 *
 * Key: todayWidgetPayload_v1
 * App Group: group.com.vibecode.openinvite.0qi5wk
 * Kind: OpenInviteTodayWidget
 */

import WidgetKit
import SwiftUI

// MARK: - Shared constants (must match JS todayWidgetContract.ts)

private let kAppGroup = "group.com.vibecode.openinvite.0qi5wk"
private let kPayloadKey = "todayWidgetPayload_v1"
private let kWidgetKind = "OpenInviteTodayWidget"
private let kScheme = "open-invite"

// MARK: - Decodable models

struct WidgetItem: Decodable, Identifiable {
    let id: String
    let title: String
    let startMs: Double
    let endMs: Double
    let timeLabel: String
    let deepLink: String
}

struct WidgetPayload: Decodable {
    let schemaVersion: Int
    let generatedAtMs: Double
    let dateKeyLocal: String
    let items: [WidgetItem]
    let moreCount: Int
    let emptyState: String // "none" | "no_events_today"
}

// MARK: - Timeline Provider

struct TodayWidgetEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload?
}

struct TodayWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayWidgetEntry {
        TodayWidgetEntry(date: .now, payload: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayWidgetEntry) -> Void) {
        let entry = TodayWidgetEntry(date: .now, payload: loadPayload())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayWidgetEntry>) -> Void) {
        let entry = TodayWidgetEntry(date: .now, payload: loadPayload())
        // Refresh at midnight local time (new day) or when app triggers reload
        let midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86400)
        let timeline = Timeline(entries: [entry], policy: .after(midnight))
        completion(timeline)
    }

    private func loadPayload() -> WidgetPayload? {
        guard let defaults = UserDefaults(suiteName: kAppGroup),
              let jsonString = defaults.string(forKey: kPayloadKey),
              let data = jsonString.data(using: .utf8)
        else { return nil }

        return try? JSONDecoder().decode(WidgetPayload.self, from: data)
    }
}

// MARK: - Widget Views

struct EventRowView: View {
    let item: WidgetItem
    let isCompact: Bool

    var body: some View {
        HStack(spacing: 8) {
            // Time label
            Text(item.timeLabel)
                .font(.system(size: isCompact ? 11 : 12, weight: .semibold, design: .rounded))
                .foregroundColor(.secondary)
                .frame(width: isCompact ? 48 : 56, alignment: .leading)
                .lineLimit(1)

            // Accent bar
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.accentColor)
                .frame(width: 3)

            // Title
            Text(item.title)
                .font(.system(size: isCompact ? 13 : 14, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 0)
        }
        .padding(.vertical, 2)
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 4) {
            Text("☀️")
                .font(.system(size: 24))
            Text("No plans today")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundColor(.secondary)
        }
    }
}

struct SmallWidgetView: View {
    let entry: TodayWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Header
            HStack {
                Text("Today")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                Spacer()
                Image(systemName: "calendar")
                    .font(.system(size: 12))
                    .foregroundColor(.accentColor)
            }

            if let payload = entry.payload, !payload.items.isEmpty {
                // Show first item
                if let first = payload.items.first {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(first.timeLabel)
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .foregroundColor(.accentColor)
                        Text(first.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                if payload.items.count > 1 || payload.moreCount > 0 {
                    let remaining = payload.items.count - 1 + payload.moreCount
                    Text("+\(remaining) more")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(.secondary)
                }
            } else {
                Spacer()
                EmptyStateView()
                Spacer()
            }
        }
        .padding(12)
    }
}

struct MediumWidgetView: View {
    let entry: TodayWidgetEntry
    private let maxRows = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Header
            HStack {
                Text("Today")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                Spacer()
                Image(systemName: "calendar")
                    .font(.system(size: 12))
                    .foregroundColor(.accentColor)
            }

            if let payload = entry.payload, !payload.items.isEmpty {
                let visibleItems = Array(payload.items.prefix(maxRows))

                ForEach(visibleItems) { item in
                    Link(destination: URL(string: item.deepLink) ?? URL(string: "\(kScheme)://")!) {
                        EventRowView(item: item, isCompact: false)
                    }
                }

                let hiddenCount = max(0, payload.items.count - maxRows) + payload.moreCount
                if hiddenCount > 0 {
                    Text("+\(hiddenCount) more")
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(.secondary)
                        .padding(.top, 2)
                }
            } else {
                Spacer()
                HStack {
                    Spacer()
                    EmptyStateView()
                    Spacer()
                }
                Spacer()
            }
        }
        .padding(12)
    }
}

// MARK: - Lock Screen Accessory Views

@available(iOSApplicationExtension 16.0, *)
struct AccessoryInlineView: View {
    let entry: TodayWidgetEntry

    var body: some View {
        if let first = entry.payload?.items.first {
            Text("Next: \(first.timeLabel) \(first.title)")
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        } else {
            Text("No plans today")
        }
    }
}

@available(iOSApplicationExtension 16.0, *)
struct AccessoryRectangularView: View {
    let entry: TodayWidgetEntry

    var body: some View {
        if let first = entry.payload?.items.first {
            VStack(alignment: .leading, spacing: 2) {
                Text("Today  \(first.timeLabel)")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Text(first.title)
                    .font(.caption)
                    .fontWeight(.medium)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        } else {
            VStack(alignment: .leading, spacing: 2) {
                Text("Today")
                    .font(.caption2)
                    .foregroundColor(.secondary)
                Text("No plans")
                    .font(.caption)
                    .fontWeight(.medium)
            }
        }
    }
}

@available(iOSApplicationExtension 16.0, *)
struct AccessoryCircularView: View {
    let entry: TodayWidgetEntry

    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 1) {
                Image(systemName: "calendar")
                    .font(.system(size: 12))
                if let count = entry.payload?.items.count, count > 0 {
                    Text("\(min(count, 9))")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                }
            }
        }
    }
}

// MARK: - Widget Definition

struct OpenInviteTodayWidget: Widget {
    let kind: String = kWidgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayWidgetProvider()) { entry in
            if #available(iOS 17.0, *) {
                widgetView(for: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                widgetView(for: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Today's Plans")
        .description("See your upcoming events at a glance.")
        .supportedFamilies({
            var families: [WidgetFamily] = [.systemSmall, .systemMedium]
            if #available(iOSApplicationExtension 16.0, *) {
                families.append(contentsOf: [
                    .accessoryInline,
                    .accessoryRectangular,
                    .accessoryCircular,
                ])
            }
            return families
        }())
    }

    @ViewBuilder
    private func widgetView(for entry: TodayWidgetEntry) -> some View {
        if #available(iOSApplicationExtension 16.0, *) {
            WidgetFamilyRouter(entry: entry)
        } else {
            // Pre-iOS 16: only Home Screen families
            Link(destination: URL(string: "\(kScheme)://calendar")!) {
                GeometryReader { geometry in
                    if geometry.size.width > 200 {
                        MediumWidgetView(entry: entry)
                    } else {
                        SmallWidgetView(entry: entry)
                    }
                }
            }
        }
    }
}

/// Routes to the correct view per WidgetFamily (iOS 16+)
@available(iOSApplicationExtension 16.0, *)
private struct WidgetFamilyRouter: View {
    @Environment(\.widgetFamily) var family
    let entry: TodayWidgetEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            AccessoryInlineView(entry: entry)
        case .accessoryRectangular:
            AccessoryRectangularView(entry: entry)
        case .accessoryCircular:
            AccessoryCircularView(entry: entry)
        default:
            // Home Screen: .systemSmall, .systemMedium
            Link(destination: URL(string: "\(kScheme)://calendar")!) {
                GeometryReader { geometry in
                    if geometry.size.width > 200 {
                        MediumWidgetView(entry: entry)
                    } else {
                        SmallWidgetView(entry: entry)
                    }
                }
            }
        }
    }
}
