//
//  LiveActivityBridge.m
//  OpenInvite
//
//  Objective-C bridge for LiveActivityBridge Swift native module.
//  Required because RCT_EXTERN_MODULE macros must be in .m files.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(LiveActivityBridge, NSObject)

RCT_EXTERN_METHOD(startActivity:(NSString *)eventId
                  eventTitle:(NSString *)eventTitle
                  startTimeEpoch:(double)startTimeEpoch
                  locationName:(NSString *)locationName
                  rsvpStatus:(NSString *)rsvpStatus
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSString *)eventId
                  rsvpStatus:(NSString *)rsvpStatus
                  ended:(BOOL)ended
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endActivity:(NSString *)eventId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getActiveEventId:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(areActivitiesEnabled:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
