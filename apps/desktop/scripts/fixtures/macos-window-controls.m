#import <Cocoa/Cocoa.h>

// Inspect actual AppKit buttons, not Electron's requested coordinates.
const char *snapshot(unsigned long long handle) {
  @autoreleasepool {
    NSWindow *window = ((__bridge NSView *)(void *)handle).window;
    NSView *root = window.contentView.superview;
    NSMutableArray *buttons = [NSMutableArray array];
    for (NSInteger i = 0; i < 3; ++i) {
      NSButton *button = [window standardWindowButton:i];
      NSRect rect = [button convertRect:button.bounds toView:root];
      NSView *hit = [root hitTest:NSMakePoint(NSMidX(rect), NSMidY(rect))];
      [buttons addObject:@{@"type":@(i), @"x":@(rect.origin.x), @"y":@(rect.origin.y),
        @"width":@(rect.size.width), @"height":@(rect.size.height),
        @"hidden":@(button.hidden), @"enabled":@(button.enabled),
        @"hittable":@(hit == button || [hit isDescendantOf:button])}];
    }
    NSData *json = [NSJSONSerialization dataWithJSONObject:
      @{@"width":@(NSWidth(root.bounds)), @"height":@(NSHeight(root.bounds)), @"buttons":buttons}
      options:0 error:nil];
    static NSString *saved;
    saved = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    return saved.UTF8String;
  }
}

void clickButton(unsigned long long handle, int button) {
  NSWindow *window = ((__bridge NSView *)(void *)handle).window;
  [[window standardWindowButton:button] performClick:nil];
}
