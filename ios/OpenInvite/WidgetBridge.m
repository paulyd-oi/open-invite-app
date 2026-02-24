//
//  WidgetBridge.m
//  OpenInvite
//
//  Objective-C bridge for WidgetBridge Swift native module.
//  Required because RCT_EXTERN_MODULE macros must be in .m files.
//

#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetBridge, NSObject)
RCT_EXTERN_METHOD(updateEvents:(NSString *)eventsJson)
@end
