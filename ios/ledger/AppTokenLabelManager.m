//
//  AppTokenLabelManager.m
//  ledger
//

#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(AppTokenLabelManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(tokenKey, NSString)
RCT_EXPORT_VIEW_PROPERTY(color, NSString)
RCT_EXPORT_VIEW_PROPERTY(fontSize, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(iconOnly, BOOL)

@end
