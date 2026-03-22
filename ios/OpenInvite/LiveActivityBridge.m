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
                  endTimeEpoch:(double)endTimeEpoch
                  locationName:(NSString *)locationName
                  rsvpStatus:(NSString *)rsvpStatus
                  emoji:(NSString *)emoji
                  goingCount:(NSInteger)goingCount
                  themeAccentColor:(NSString *)themeAccentColor
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateActivity:(NSString *)eventId
                  rsvpStatus:(NSString *)rsvpStatus
                  ended:(BOOL)ended
                  goingCount:(NSInteger)goingCount
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
