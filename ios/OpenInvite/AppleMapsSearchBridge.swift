//
//  AppleMapsSearchBridge.swift
//  OpenInvite
//
//  React Native native module for local place search via Apple MapKit.
//  Wraps MKLocalSearch to provide free, native POI/business search
//  with automatic device-location relevance.
//

import Foundation
import React
import MapKit

@objc(AppleMapsSearchBridge)
class AppleMapsSearchBridge: NSObject {

    // MARK: - Search

    @objc
    func search(
        _ query: String,
        lat: Double,
        lon: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = [.pointOfInterest, .address]

        // Apply region bias if valid coordinates provided (0,0 = no bias)
        if lat != 0 || lon != 0 {
            let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
            // ~50km span for local relevance
            let span = MKCoordinateSpan(latitudeDelta: 0.5, longitudeDelta: 0.5)
            request.region = MKCoordinateRegion(center: center, span: span)
        }

        let search = MKLocalSearch(request: request)
        search.start { response, error in
            if let error = error {
                reject("SEARCH_FAILED", error.localizedDescription, error)
                return
            }

            guard let response = response else {
                resolve([])
                return
            }

            let results: [[String: Any]] = response.mapItems.prefix(8).map { item in
                var result: [String: Any] = [
                    "name": item.name ?? "",
                    "latitude": item.placemark.coordinate.latitude,
                    "longitude": item.placemark.coordinate.longitude,
                ]

                // Build formatted address from placemark components
                let pm = item.placemark
                var parts: [String] = []
                if let street = pm.thoroughfare {
                    if let number = pm.subThoroughfare {
                        parts.append("\(number) \(street)")
                    } else {
                        parts.append(street)
                    }
                }
                if let city = pm.locality { parts.append(city) }
                if let state = pm.administrativeArea { parts.append(state) }

                result["address"] = parts.joined(separator: ", ")

                // Full address includes postal code
                if let zip = pm.postalCode { parts.append(zip) }
                result["fullAddress"] = parts.joined(separator: ", ")

                if let phone = item.phoneNumber { result["phone"] = phone }
                if let url = item.url?.absoluteString { result["url"] = url }

                return result
            }

            resolve(results)
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
