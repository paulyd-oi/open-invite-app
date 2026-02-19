/**
 * WidgetBridge ObjC wrapper — registers Swift module with React Native bridge.
 *
 * This .m file is required because React Native's RCT_EXTERN_MODULE
 * macro only works in Objective-C. The actual implementation is in
 * WidgetBridgeModule.swift.
 */

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetBridge, NSObject)

RCT_EXTERN_METHOD(setTodayWidgetPayload:(NSString *)jsonString
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reloadTodayWidget:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
