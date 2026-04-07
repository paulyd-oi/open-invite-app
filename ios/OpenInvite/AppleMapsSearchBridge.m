//
//  AppleMapsSearchBridge.m
//  OpenInvite
//
//  Objective-C bridge for AppleMapsSearchBridge Swift native module.
//  Required because RCT_EXTERN_MODULE macros must be in .m files.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AppleMapsSearchBridge, NSObject)

RCT_EXTERN_METHOD(search:(NSString *)query
                  lat:(double)lat
                  lon:(double)lon
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
