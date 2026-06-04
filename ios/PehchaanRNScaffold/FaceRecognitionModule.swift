import Foundation
import UIKit
import TensorFlowLite

/**
 * React Native bridge — offline face recognition + liveness (iOS).
 * Mirrors FaceRecognitionModule.kt exactly.
 *
 * Models from app bundle: mobilefacenet_indian.tflite, blazeface.tflite
 * Exposed: checkFaceQuality, runInference, checkLiveness
 */
@objc(FaceRecognitionModule)
class FaceRecognitionModule: NSObject {

    // MARK: - Constants

    private let MFN_SIZE  = 112
    private let BF_SIZE   = 128
    private let EMBED_DIM = 512
    private let BF_SCALE: Float  = 128.0
    private let BF_SCORE_THRESH: Float = 0.5

    private let BLINK_EAR_THRESH: Float = 0.45   // pixel-brightness EAR proxy
    private let BLINK_MIN_FRAMES = 2
    private let YAW_TURN_THRESH: Float  = 15.0
    private let YAW_FRAME_RATIO: Float  = 0.4

    private let MIN_BRIGHTNESS: Float   = 0.15
    private let MAX_BRIGHTNESS: Float   = 0.92
    private let MIN_SHARPNESS:  Float   = 0.10
    private let MIN_FACE_RATIO: Float   = 0.08

    // MARK: - Lazy interpreters

    private lazy var mfnInterp: Interpreter? = loadModel("mobilefacenet_indian")
    private lazy var bfInterp:  Interpreter? = loadModel("blazeface")
    private lazy var bfAnchors: [[Float]]    = generateAnchors()
    private var bfRegressorsIdx = 0
    private var bfScoresIdx     = 1

    private func loadModel(_ name: String) -> Interpreter? {
        guard let path = Bundle.main.path(forResource: name, ofType: "tflite") else { return nil }
        var opts = Interpreter.Options(); opts.threadCount = 4
        guard let interp = try? Interpreter(modelPath: path, options: opts) else { return nil }
        try? interp.allocateTensors()
        if name.contains("blazeface") {
            for i in 0 ..< interp.outputTensorCount {
                guard let t = try? interp.output(at: i) else { continue }
                if t.shape.dimensions.last == 16 { bfRegressorsIdx = i }
                if t.shape.dimensions.last == 1  { bfScoresIdx = i }
            }
        }
        return interp
    }

    // MARK: - 1. Face Quality Check

    @objc(checkFaceQuality:resolver:rejecter:)
    func checkFaceQuality(
        _ frameBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        guard
            let data = Data(base64Encoded: frameBase64),
            let src  = UIImage(data: data)
        else { reject("QUALITY_ERROR", "Cannot decode frame", nil); return }

        guard let det = runBlazeFace(src) else {
            resolve(["passed": false, "brightness": 0.0, "sharpness": 0.0,
                     "faceAreaRatio": 0.0, "failReason": "no_face"])
            return
        }

        let box           = det.box
        let faceAreaRatio = Float(box.width * box.height)
        guard let faceCrop = cropImage(src, box: box, pad: 0.0) else {
            resolve(["passed": false, "brightness": 0.0, "sharpness": 0.0,
                     "faceAreaRatio": Double(faceAreaRatio), "failReason": "no_face"])
            return
        }
        let brightness = computeBrightness(faceCrop)
        let sharpness  = computeSharpness(faceCrop)

        let failReason: String?
        if      faceAreaRatio < MIN_FACE_RATIO  { failReason = "too_small" }
        else if brightness < MIN_BRIGHTNESS     { failReason = "too_dark" }
        else if brightness > MAX_BRIGHTNESS     { failReason = "too_bright" }
        else if sharpness < MIN_SHARPNESS       { failReason = "blurry" }
        else if abs(det.yawDegrees) > 30.0      { failReason = "face_angle_too_high" }
        else                                    { failReason = nil }

        var result: [String: Any] = [
            "passed":        failReason == nil,
            "brightness":    Double(brightness),
            "sharpness":     Double(sharpness),
            "faceAreaRatio": Double(faceAreaRatio),
        ]
        if let r = failReason { result["failReason"] = r }
        resolve(result)
    }

    // MARK: - 2. Face Recognition

    @objc(runInference:candidatesJson:threshold:resolver:rejecter:)
    func runInference(
        _ frameBase64:    String,
        candidatesJson:   String,
        threshold:        Double,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        let t0 = Date()
        guard
            let data = Data(base64Encoded: frameBase64),
            let src  = UIImage(data: data)
        else { reject("INFERENCE_ERROR", "Cannot decode image", nil); return }

        // 1. Detect face
        guard let det = runBlazeFace(src) else {
            resolve(["workerId": NSNull(), "confidence": 0.0,
                     "inferenceMs": Date().timeIntervalSince(t0) * 1000, "qualityScore": 0.0])
            return
        }

        // 2. Crop + resize to 112×112
        guard
            let cropped = cropImage(src, box: det.box, pad: 0.15),
            let mfnBmp  = cropped.resized(to: CGSize(width: MFN_SIZE, height: MFN_SIZE)),
            let pixels  = mfnBmp.rgbPixelData(),
            let interp  = mfnInterp
        else { reject("INFERENCE_ERROR", "Image processing failed", nil); return }

        // 3. Quantise to INT8
        do {
            let inputTensor = try interp.input(at: 0)
            let scale    = Float(inputTensor.quantizationParameters?.scale    ?? 0.00784)
            let zeroPoint = inputTensor.quantizationParameters?.zeroPoint ?? -1

            var inputBytes = [Int8](repeating: 0, count: MFN_SIZE * MFN_SIZE * 3)
            for i in 0 ..< MFN_SIZE * MFN_SIZE {
                let r = Float(pixels[i * 3 + 0]) / 127.5 - 1.0
                let g = Float(pixels[i * 3 + 1]) / 127.5 - 1.0
                let b = Float(pixels[i * 3 + 2]) / 127.5 - 1.0
                inputBytes[i * 3 + 0] = quantize(r, scale: scale, zp: zeroPoint)
                inputBytes[i * 3 + 1] = quantize(g, scale: scale, zp: zeroPoint)
                inputBytes[i * 3 + 2] = quantize(b, scale: scale, zp: zeroPoint)
            }

            // 4. Run MobileFaceNet
            try interp.copy(Data(bytes: inputBytes, count: inputBytes.count), toInputAt: 0)
            try interp.invoke()
            let outTensor = try interp.output(at: 0)
            let queryEmb  = outTensor.data.withUnsafeBytes {
                Array(UnsafeBufferPointer<Float>(
                    start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                    count: EMBED_DIM))
            }
            let queryNorm = l2norm(queryEmb)

            // 5. Compare candidates
            guard
                let jsonData   = candidatesJson.data(using: .utf8),
                let candidates = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]]
            else { reject("INFERENCE_ERROR", "Invalid candidates JSON", nil); return }

            var bestId = ""; var bestScore: Float = 0
            for entry in candidates {
                if entry["isRevoked"] as? Bool == true { continue }
                guard
                    let b64  = entry["embeddingBase64"] as? String,
                    let eData = Data(base64Encoded: b64)
                else { continue }
                let embFloat = eData.withUnsafeBytes {
                    Array(UnsafeBufferPointer<Float>(
                        start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                        count: eData.count / 4))
                }
                let score = cosine(queryEmb, normA: queryNorm, b: embFloat)
                if score > bestScore {
                    bestScore = score
                    bestId = entry["workerId"] as? String ?? ""
                }
            }

            let ms = Date().timeIntervalSince(t0) * 1000
            let matched = bestScore >= Float(threshold) && !bestId.isEmpty
            resolve([
                "workerId":    matched ? bestId : NSNull(),
                "confidence":  Double(bestScore),
                "inferenceMs": ms,
                "qualityScore": 1.0,
            ])
        } catch {
            reject("INFERENCE_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - 3. Generate Embedding

    @objc(generateEmbedding:resolver:rejecter:)
    func generateEmbedding(
        _ frameBase64: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        guard
            let data = Data(base64Encoded: frameBase64),
            let src  = UIImage(data: data)
        else { reject("EMBED_ERROR", "Cannot decode frame", nil); return }

        guard let det = runBlazeFace(src) else {
            resolve(["embeddingBase64": NSNull(), "qualityScore": 0.0, "faceFound": false])
            return
        }

        guard
            let cropped = cropImage(src, box: det.box, pad: 0.15),
            let mfnBmp  = cropped.resized(to: CGSize(width: MFN_SIZE, height: MFN_SIZE)),
            let pixels  = mfnBmp.rgbPixelData(),
            let interp  = mfnInterp
        else { reject("EMBED_ERROR", "Image processing failed", nil); return }

        do {
            let inputTensor = try interp.input(at: 0)
            let scale     = Float(inputTensor.quantizationParameters?.scale    ?? 0.00784)
            let zeroPoint = inputTensor.quantizationParameters?.zeroPoint ?? -1

            var inputBytes = [Int8](repeating: 0, count: MFN_SIZE * MFN_SIZE * 3)
            for i in 0 ..< MFN_SIZE * MFN_SIZE {
                let r = Float(pixels[i * 3 + 0]) / 127.5 - 1.0
                let g = Float(pixels[i * 3 + 1]) / 127.5 - 1.0
                let b = Float(pixels[i * 3 + 2]) / 127.5 - 1.0
                inputBytes[i * 3 + 0] = quantize(r, scale: scale, zp: zeroPoint)
                inputBytes[i * 3 + 1] = quantize(g, scale: scale, zp: zeroPoint)
                inputBytes[i * 3 + 2] = quantize(b, scale: scale, zp: zeroPoint)
            }

            try interp.copy(Data(bytes: inputBytes, count: inputBytes.count), toInputAt: 0)
            try interp.invoke()
            let outTensor = try interp.output(at: 0)
            var embedding = outTensor.data.withUnsafeBytes {
                Array(UnsafeBufferPointer<Float>(
                    start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                    count: EMBED_DIM))
            }

            // L2-normalise so cosine similarity = dot product
            let norm = l2norm(embedding)
            embedding = embedding.map { $0 / norm }

            // Encode as little-endian float32 bytes → base64
            var embData = Data(count: EMBED_DIM * 4)
            embData.withUnsafeMutableBytes { ptr in
                let floatPtr = ptr.baseAddress!.assumingMemoryBound(to: Float.self)
                for (i, v) in embedding.enumerated() { floatPtr[i] = v }
            }
            let embeddingBase64 = embData.base64EncodedString()
            let qualityScore = Double(min(1.0, Float(det.box.width * det.box.height)))

            resolve([
                "embeddingBase64": embeddingBase64,
                "qualityScore":    qualityScore,
                "faceFound":       true,
            ])
        } catch {
            reject("EMBED_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - 4. Liveness Detection

    @objc(checkLiveness:challenge:resolver:rejecter:)
    func checkLiveness(
        _ framesBase64: [Any],
        challenge:      String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        let t0 = Date()
        var earSeries  = [Float]()
        var yawSeries  = [Float]()

        for item in framesBase64 {
            guard
                let b64  = item as? String,
                let data = Data(base64Encoded: b64),
                let img  = UIImage(data: data),
                let det  = runBlazeFace(img)
            else { continue }
            earSeries.append(det.earProxy)
            yawSeries.append(det.yawDegrees)
        }

        let durationMs = Date().timeIntervalSince(t0) * 1000
        var result: [String: Any] = ["durationMs": durationMs]

        switch challenge {
        case "blink":
            result["passed"] = detectBlink(earSeries)
            result["ear"]    = earSeries.averageValue
        case "turn_left":
            let n = yawSeries.count
            result["passed"]     = n > 0 && Float(yawSeries.filter { $0 < -YAW_TURN_THRESH }.count) / Float(n) >= YAW_FRAME_RATIO
            result["yawDegrees"] = yawSeries.averageValue
        case "turn_right":
            let n = yawSeries.count
            result["passed"]     = n > 0 && Float(yawSeries.filter { $0 > YAW_TURN_THRESH }.count) / Float(n) >= YAW_FRAME_RATIO
            result["yawDegrees"] = yawSeries.averageValue
        default:
            result["passed"] = false
        }
        resolve(result)
    }

    // MARK: - BlazeFace

    private struct BFResult {
        let box:        CGRect   // normalised [0,1]
        let kpX:        [Float]
        let kpY:        [Float]
        let earProxy:   Float
        let yawDegrees: Float
        let bfImage:    UIImage
    }

    private func runBlazeFace(_ src: UIImage) -> BFResult? {
        guard
            let bfImg   = src.resized(to: CGSize(width: BF_SIZE, height: BF_SIZE)),
            let pixels  = bfImg.rgbPixelData(),
            let interp  = bfInterp
        else { return nil }

        var floatPixels = [Float](repeating: 0, count: BF_SIZE * BF_SIZE * 3)
        for i in 0 ..< BF_SIZE * BF_SIZE {
            floatPixels[i * 3 + 0] = Float(pixels[i * 3 + 0]) / 255.0
            floatPixels[i * 3 + 1] = Float(pixels[i * 3 + 1]) / 255.0
            floatPixels[i * 3 + 2] = Float(pixels[i * 3 + 2]) / 255.0
        }

        guard
            (try? interp.copy(Data(bytes: floatPixels, count: floatPixels.count * 4), toInputAt: 0)) != nil,
            (try? interp.invoke()) != nil,
            let regTensor   = try? interp.output(at: bfRegressorsIdx),
            let scoreTensor = try? interp.output(at: bfScoresIdx)
        else { return nil }

        let allRegs = regTensor.data.withUnsafeBytes {
            Array(UnsafeBufferPointer<Float>(
                start: $0.baseAddress!.assumingMemoryBound(to: Float.self), count: 896 * 16))
        }
        let allScores = scoreTensor.data.withUnsafeBytes {
            Array(UnsafeBufferPointer<Float>(
                start: $0.baseAddress!.assumingMemoryBound(to: Float.self), count: 896))
        }

        var bestScore = BF_SCORE_THRESH; var bestIdx = -1
        for i in 0 ..< 896 {
            let s = sigmoid(allScores[i])
            if s > bestScore { bestScore = s; bestIdx = i }
        }
        guard bestIdx >= 0 else { return nil }

        let raw    = Array(allRegs[(bestIdx * 16) ..< (bestIdx * 16 + 16)])
        let anchor = bfAnchors[bestIdx]
        return decodeBFResult(raw: raw, anchor: anchor, bfImg: bfImg, pixels: pixels)
    }

    private func decodeBFResult(raw: [Float], anchor: [Float], bfImg: UIImage, pixels: [UInt8]) -> BFResult {
        let cx = raw[1] / BF_SCALE + anchor[0]
        let cy = raw[0] / BF_SCALE + anchor[1]
        let fw = max(raw[3] / BF_SCALE, 0.01)
        let fh = max(raw[2] / BF_SCALE, 0.01)
        let box = CGRect(x: CGFloat(cx - fw / 2), y: CGFloat(cy - fh / 2),
                         width: CGFloat(fw), height: CGFloat(fh))

        var kpX = [Float](repeating: 0, count: 6)
        var kpY = [Float](repeating: 0, count: 6)
        for i in 0 ..< 6 {
            kpX[i] = raw[4 + i * 2 + 1] / BF_SCALE + anchor[0]
            kpY[i] = raw[4 + i * 2]     / BF_SCALE + anchor[1]
        }

        // EAR proxy: pixel brightness of eye region — open=low brightness → inverted=high proxy
        let eyeW = max(4, Int(fw * Float(BF_SIZE) * 0.18))
        let eyeH = max(3, Int(fh * Float(BF_SIZE) * 0.10))
        let leftBright  = eyeRegionBrightness(pixels: pixels, w: BF_SIZE, h: BF_SIZE,
                                              cx: Int(kpX[1] * Float(BF_SIZE)), cy: Int(kpY[1] * Float(BF_SIZE)),
                                              rw: eyeW, rh: eyeH)
        let rightBright = eyeRegionBrightness(pixels: pixels, w: BF_SIZE, h: BF_SIZE,
                                              cx: Int(kpX[0] * Float(BF_SIZE)), cy: Int(kpY[0] * Float(BF_SIZE)),
                                              rw: eyeW, rh: eyeH)
        let earProxy = 1.0 - (leftBright + rightBright) / 2.0

        // Yaw
        let eyeMidX    = (kpX[0] + kpX[1]) / 2
        let yawDegrees = ((kpX[2] - eyeMidX) / max(fw, 0.01)) * 90

        return BFResult(box: box, kpX: kpX, kpY: kpY, earProxy: earProxy,
                        yawDegrees: yawDegrees, bfImage: bfImg)
    }

    private func eyeRegionBrightness(pixels: [UInt8], w: Int, h: Int,
                                      cx: Int, cy: Int, rw: Int, rh: Int) -> Float {
        var sum = 0; var count = 0
        for dy in -rh/2 ..< rh/2 {
            for dx in -rw/2 ..< rw/2 {
                let px = max(0, min(w - 1, cx + dx))
                let py = max(0, min(h - 1, cy + dy))
                let idx = (py * w + px) * 3
                let g = (Int(pixels[idx]) * 299 + Int(pixels[idx+1]) * 587 + Int(pixels[idx+2]) * 114) / 1000
                sum += g; count += 1
            }
        }
        return count > 0 ? Float(sum) / Float(count) / 255.0 : 0.5
    }

    private func detectBlink(_ series: [Float]) -> Bool {
        guard series.count >= BLINK_MIN_FRAMES else { return false }
        var run = 0; var maxRun = 0
        for v in series {
            if v < BLINK_EAR_THRESH { run += 1; maxRun = max(maxRun, run) } else { run = 0 }
        }
        return maxRun >= BLINK_MIN_FRAMES
    }

    // MARK: - Quality helpers

    private func computeBrightness(_ img: UIImage) -> Float {
        guard let px = img.rgbPixelData() else { return 0.5 }
        let total = px.count / 3
        let stride = max(1, total / 2000)
        var sum = 0; var count = 0
        var i = 0
        while i < total {
            let off = i * 3
            let g = (Int(px[off]) * 299 + Int(px[off+1]) * 587 + Int(px[off+2]) * 114) / 1000
            sum += g; count += 1; i += stride
        }
        return count > 0 ? Float(sum) / Float(count) / 255.0 : 0.5
    }

    private func computeSharpness(_ img: UIImage) -> Float {
        guard
            let small  = img.resized(to: CGSize(width: 64, height: 64)),
            let pixels = small.rgbPixelData()
        else { return 0.0 }
        let w = 64; let h = 64
        var sumSq: Double = 0
        for y in 1 ..< h - 1 {
            for x in 1 ..< w - 1 {
                func g(_ px: Int, _ py: Int) -> Int {
                    let off = (py * w + px) * 3
                    return (Int(pixels[off]) * 299 + Int(pixels[off+1]) * 587 + Int(pixels[off+2]) * 114) / 1000
                }
                let lap = 4 * g(x,y) - g(x-1,y) - g(x+1,y) - g(x,y-1) - g(x,y+1)
                sumSq += Double(lap * lap)
            }
        }
        let variance = sumSq / Double((w - 2) * (h - 2))
        return Float(min(1.0, variance / 500.0))
    }

    // MARK: - Anchors

    private func generateAnchors() -> [[Float]] {
        let strides = [8, 16]; let apc = [2, 6]
        var out = [[Float]](); out.reserveCapacity(896)
        for s in strides.indices {
            let cells = BF_SIZE / strides[s]
            for row in 0 ..< cells { for col in 0 ..< cells {
                let cx = (Float(col) + 0.5) / Float(cells)
                let cy = (Float(row) + 0.5) / Float(cells)
                for _ in 0 ..< apc[s] { out.append([cx, cy]) }
            }}
        }
        return out
    }

    // MARK: - Math helpers

    private func quantize(_ v: Float, scale: Float, zp: Int) -> Int8 {
        let q = Int((v / scale).rounded()) + zp
        return Int8(max(-128, min(127, q)))
    }
    private func l2norm(_ v: [Float]) -> Float {
        max(sqrt(v.reduce(0) { $0 + $1 * $1 }), 1e-10)
    }
    private func cosine(_ a: [Float], normA: Float, b: [Float]) -> Float {
        let normB = l2norm(b); var dot: Float = 0
        for i in 0 ..< min(a.count, b.count) { dot += a[i] * b[i] }
        return max(-1, min(1, dot / (normA * normB)))
    }
    private func sigmoid(_ x: Float) -> Float { 1 / (1 + exp(-x)) }
    private func cropImage(_ img: UIImage, box: CGRect, pad: CGFloat) -> UIImage? {
        guard let cg = img.cgImage else { return nil }
        let W = CGFloat(cg.width); let H = CGFloat(cg.height)
        let fw = box.width; let fh = box.height
        let l = max(0, (box.minX - fw * pad) * W)
        let t = max(0, (box.minY - fh * pad) * H)
        let r = min(W, (box.maxX + fw * pad) * W)
        let b = min(H, (box.maxY + fh * pad) * H)
        guard let cropped = cg.cropping(to: CGRect(x: l, y: t, width: r - l, height: b - t)) else { return nil }
        return UIImage(cgImage: cropped)
    }
}

// MARK: - UIImage helpers

private extension UIImage {
    func resized(to size: CGSize) -> UIImage? {
        UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
        defer { UIGraphicsEndImageContext() }
        draw(in: CGRect(origin: .zero, size: size))
        return UIGraphicsGetImageFromCurrentImageContext()
    }
    func rgbPixelData() -> [UInt8]? {
        guard let cg = cgImage else { return nil }
        let w = cg.width; let h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 3)
        guard let ctx = CGContext(data: &data, width: w, height: h,
                                  bitsPerComponent: 8, bytesPerRow: w * 3,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        return data
    }
}

private extension Array where Element == Float {
    var averageValue: Double { isEmpty ? 0.0 : Double(reduce(0, +)) / Double(count) }
}
