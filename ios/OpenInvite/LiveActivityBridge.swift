//
//  LiveActivityBridge.swift
//  OpenInvite
//
//  React Native native module for managing Live Activities via ActivityKit.
//  Exposes start / update / end / getActive to JavaScript.
//
//  HARDENED: No @available on the class itself — ObjC registration always
//  succeeds. Every method checks #available(iOS 16.1, *) at runtime and
//  returns a safe rejection on unsupported OS versions.
//

import Foundation
import React
import ActivityKit

@objc(LiveActivityBridge)
class LiveActivityBridge: NSObject {

    // MARK: - Start Live Activity

    @objc
    func startActivity(
        _ eventId: String,
        eventTitle: String,
        startTimeEpoch: Double,
        locationName: String?,
        rsvpStatus: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            reject("UNSUPPORTED_OS", "Live Activities require iOS 16.1+", nil)
            return
        }

        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            reject("ACTIVITIES_DISABLED", "Live Activities are not enabled", nil)
            return
        }

        // End any existing activity first (one-active invariant)
        for activity in Activity<OpenInviteEventAttributes>.activities {
            Task {
                await activity.end(dismissalPolicy: .immediate)
            }
        }

        let attributes = OpenInviteEventAttributes(
            eventId: eventId,
            eventTitle: eventTitle,
            startTimeEpoch: startTimeEpoch,
            locationName: locationName
        )

        let state = OpenInviteEventAttributes.ContentState(
            rsvpStatus: rsvpStatus,
            ended: false
        )

        do {
            let activity = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
            resolve(["activityId": activity.id])
        } catch {
            reject("START_FAILED", error.localizedDescription, error)
        }
    }

    // MARK: - Update Live Activity

    @objc
    func updateActivity(
        _ eventId: String,
        rsvpStatus: String,
        ended: Bool,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            reject("UNSUPPORTED_OS", "Live Activities require iOS 16.1+", nil)
            return
        }

        let state = OpenInviteEventAttributes.ContentState(
            rsvpStatus: rsvpStatus,
            ended: ended
        )

        var found = false
        for activity in Activity<OpenInviteEventAttributes>.activities {
            if activity.attributes.eventId == eventId {
                found = true
                Task {
                    await activity.update(using: state)
                }
            }
        }

        if found {
            resolve(["updated": true])
        } else {
            reject("NOT_FOUND", "No active Live Activity for event \(eventId)", nil)
        }
    }

    // MARK: - End Live Activity

    @objc
    func endActivity(
        _ eventId: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            resolve(["ended": 0])
            return
        }

        var ended = 0
        for activity in Activity<OpenInviteEventAttributes>.activities {
            if eventId == nil || activity.attributes.eventId == eventId {
                Task {
                    await activity.end(dismissalPolicy: .immediate)
                }
                ended += 1
            }
        }
        resolve(["ended": ended])
    }

    // MARK: - Get Active Activity

    @objc
    func getActiveEventId(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            resolve(NSNull())
            return
        }

        let activities = Activity<OpenInviteEventAttributes>.activities
        if let first = activities.first {
            resolve(first.attributes.eventId)
        } else {
            resolve(NSNull())
        }
    }

    // MARK: - Check if Live Activities are enabled

    @objc
    func areActivitiesEnabled(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard #available(iOS 16.1, *) else {
            resolve(false)
            return
        }
        resolve(ActivityAuthorizationInfo().areActivitiesEnabled)
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
