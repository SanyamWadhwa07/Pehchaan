#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FaceRecognitionModule, NSObject)

RCT_EXTERN_METHOD(
  checkFaceQuality:(NSString *)frameBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  generateEmbedding:(NSString *)frameBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  runInference:(NSString *)frameBase64
  candidatesJson:(NSString *)candidatesJson
  threshold:(double)threshold
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  checkLiveness:(NSArray *)framesBase64
  challenge:(NSString *)challenge
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

+ (BOOL)requiresMainQueueSetup { return NO; }

@end
