import Foundation
import UIKit
import TensorFlowLite

/**
 * React Native bridge for offline face recognition and liveness detection (iOS).
 * Mirrors FaceRecognitionModule.kt exactly — same method signatures, same logic.
 *
 * Models loaded from app bundle:
 *   mobilefacenet_indian.tflite — INT8, 512-d embeddings
 *   blazeface.tflite            — float32, 128×128 input
 */
@objc(FaceRecognitionModule)
class FaceRecognitionModule: NSObject {

    // MARK: - Constants

    private let mfnSize = 112
    private let bfSize  = 128
    private let embedDim = 512
    private let bfScoreThresh: Float = 0.5
    private let blinkEarThresh: Float = 0.25
    private let yawTurnThresh: Float = 15.0
    private let yawFrameRatio: Float = 0.4

    // MARK: - Lazy interpreters

    private lazy var mfnInterpreter: Interpreter? = loadModel("mobilefacenet_indian")
    private lazy var bfInterpreter: Interpreter?  = loadModel("blazeface")
    private lazy var bfAnchors: [[Float]] = generateBlazeFaceAnchors()
    private var bfRegressorsIdx = 0
    private var bfScoresIdx = 1

    private func loadModel(_ name: String) -> Interpreter? {
        guard let path = Bundle.main.path(forResource: name, ofType: "tflite") else {
            return nil
        }
        var options = Interpreter.Options()
        options.threadCount = 4
        let interp = try? Interpreter(modelPath: path, options: options)
        try? interp?.allocateTensors()

        // Identify BlazeFace output order by shape
        if name.contains("blazeface"), let interp = interp {
            for i in 0 ..< (try? interp.outputTensorCount()).map({ Int($0) } ) ?? 0 {
                if let t = try? interp.output(at: i) {
                    if t.shape.dimensions.last == 16 { bfRegressorsIdx = i }
                    if t.shape.dimensions.last == 1  { bfScoresIdx = i }
                }
            }
        }
        return interp
    }

    // MARK: - Face Recognition

    @objc(runInference:candidatesJson:threshold:resolver:rejecter:)
    func runInference(
        _ faceFrameBase64: String,
        candidatesJson: String,
        threshold: Double,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        let t0 = Date()
        guard
            let imgData = Data(base64Encoded: faceFrameBase64),
            let uiImg = UIImage(data: imgData),
            let bmp = uiImg.resized(to: CGSize(width: mfnSize, height: mfnSize)),
            let interp = mfnInterpreter
        else {
            reject("INFERENCE_ERROR", "Could not decode image", nil); return
        }

        do {
            // Build INT8 input buffer
            let inputTensor = try interp.input(at: 0)
            let scale    = inputTensor.quantizationParameters?.scale    ?? 0.00784
            let zeroPoint = inputTensor.quantizationParameters?.zeroPoint ?? -1

            var inputBytes = [Int8](repeating: 0, count: mfnSize * mfnSize * 3)
            guard let pixelData = bmp.rgbPixelData() else {
                reject("INFERENCE_ERROR", "Could not get pixel data", nil); return
            }
            for i in 0 ..< mfnSize * mfnSize {
                let r = Float(pixelData[i * 3 + 0]) / 127.5 - 1.0
                let g = Float(pixelData[i * 3 + 1]) / 127.5 - 1.0
                let b = Float(pixelData[i * 3 + 2]) / 127.5 - 1.0
                inputBytes[i * 3 + 0] = quantize(r, scale: Float(scale), zp: zeroPoint)
                inputBytes[i * 3 + 1] = quantize(g, scale: Float(scale), zp: zeroPoint)
                inputBytes[i * 3 + 2] = quantize(b, scale: Float(scale), zp: zeroPoint)
            }
            try interp.copy(Data(bytes: inputBytes, count: inputBytes.count), toInputAt: 0)
            try interp.invoke()

            let outputTensor = try interp.output(at: 0)
            let queryEmb = outputTensor.data.withUnsafeBytes {
                Array(UnsafeBufferPointer<Float>(start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                                                count: embedDim))
            }
            let queryNorm = l2norm(queryEmb)

            // Compare candidates
            guard let jsonData = candidatesJson.data(using: .utf8),
                  let candidates = try? JSONSerialization.jsonObject(with: jsonData) as? [[String: Any]]
            else {
                reject("INFERENCE_ERROR", "Invalid candidates JSON", nil); return
            }

            var bestId: String? = nil
            var bestScore: Float = 0
            for entry in candidates {
                if entry["isRevoked"] as? Bool == true { continue }
                guard
                    let embB64 = entry["embeddingBase64"] as? String,
                    let embData = Data(base64Encoded: embB64)
                else { continue }
                let embFloat = embData.withUnsafeBytes {
                    Array(UnsafeBufferPointer<Float>(start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                                                    count: embData.count / 4))
                }
                let score = cosine(queryEmb, normA: queryNorm, b: embFloat)
                if score > bestScore {
                    bestScore = score
                    bestId = entry["workerId"] as? String
                }
            }

            let inferenceMs = Date().timeIntervalSince(t0) * 1000
            resolve([
                "workerId":    bestScore >= Float(threshold) ? bestId as Any : NSNull(),
                "confidence":  Double(bestScore),
                "inferenceMs": inferenceMs,
                "qualityScore": 1.0,
            ])
        } catch {
            reject("INFERENCE_ERROR", error.localizedDescription, error)
        }
    }

    // MARK: - Liveness Detection

    @objc(checkLiveness:challenge:resolver:rejecter:)
    func checkLiveness(
        _ framesBase64: [String],
        challenge: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject:  @escaping RCTPromiseRejectBlock
    ) {
        let t0 = Date()
        var earSeries  = [Float]()
        var yawSeries  = [Float]()

        for b64 in framesBase64 {
            guard
                let data = Data(base64Encoded: b64),
                let img  = UIImage(data: data),
                let kps  = runBlazeFace(img)
            else { continue }
            earSeries.append(kps.earProxy)
            yawSeries.append(kps.yaw)
        }

        let durationMs = Date().timeIntervalSince(t0) * 1000
        var result: [String: Any] = ["durationMs": durationMs]

        switch challenge {
        case "blink":
            let passed = detectBlink(earSeries)
            result["passed"] = passed
            result["ear"]    = earSeries.average
        case "turn_left":
            let passed = earSeries.isEmpty ? false :
                Float(yawSeries.filter { $0 < -yawTurnThresh }.count) / Float(yawSeries.count) >= yawFrameRatio
            result["passed"]     = passed
            result["yawDegrees"] = yawSeries.average
        case "turn_right":
            let passed = earSeries.isEmpty ? false :
                Float(yawSeries.filter { $0 > yawTurnThresh }.count) / Float(yawSeries.count) >= yawFrameRatio
            result["passed"]     = passed
            result["yawDegrees"] = yawSeries.average
        default:
            result["passed"] = false
        }
        resolve(result)
    }

    // MARK: - BlazeFace

    private struct FaceKps { let earProxy: Float; let yaw: Float }

    private func runBlazeFace(_ src: UIImage) -> FaceKps? {
        guard
            let bmp = src.resized(to: CGSize(width: bfSize, height: bfSize)),
            let pixels = bmp.rgbPixelData(),
            let interp = bfInterpreter
        else { return nil }

        var inputBytes = [Float](repeating: 0, count: bfSize * bfSize * 3)
        for i in 0 ..< bfSize * bfSize {
            inputBytes[i * 3 + 0] = Float(pixels[i * 3 + 0]) / 255.0
            inputBytes[i * 3 + 1] = Float(pixels[i * 3 + 1]) / 255.0
            inputBytes[i * 3 + 2] = Float(pixels[i * 3 + 2]) / 255.0
        }

        guard (try? interp.copy(Data(bytes: inputBytes, count: inputBytes.count * 4), toInputAt: 0)) != nil,
              (try? interp.invoke()) != nil,
              let regTensor  = try? interp.output(at: bfRegressorsIdx),
              let scoreTensor = try? interp.output(at: bfScoresIdx)
        else { return nil }

        let regressors = regTensor.data.withUnsafeBytes {
            Array(UnsafeBufferPointer<Float>(start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                                            count: 896 * 16))
        }
        let rawScores = scoreTensor.data.withUnsafeBytes {
            Array(UnsafeBufferPointer<Float>(start: $0.baseAddress!.assumingMemoryBound(to: Float.self),
                                            count: 896))
        }

        var bestScore = bfScoreThresh
        var bestIdx   = -1
        for i in 0 ..< 896 {
            let s = sigmoid(rawScores[i])
            if s > bestScore { bestScore = s; bestIdx = i }
        }
        guard bestIdx >= 0 else { return nil }

        return decodeKps(Array(regressors[(bestIdx * 16) ..< (bestIdx * 16 + 16)]),
                         anchor: bfAnchors[bestIdx])
    }

    private func decodeKps(_ raw: [Float], anchor: [Float]) -> FaceKps {
        let scale: Float = 128.0
        let faceW = max(raw[3] / scale, 0.01)
        let faceH = max(raw[2] / scale, 0.01)
        var kpX = [Float](repeating: 0, count: 6)
        var kpY = [Float](repeating: 0, count: 6)
        for i in 0 ..< 6 {
            kpX[i] = raw[4 + i * 2 + 1] / scale + anchor[0]
            kpY[i] = raw[4 + i * 2]     / scale + anchor[1]
        }
        let eyeMidY = (kpY[0] + kpY[1]) / 2
        let earProxy = min(max((kpY[3] - eyeMidY) / faceH, 0), 1)
        let yaw = ((kpX[2] - (kpX[0] + kpX[1]) / 2) / faceW) * 90
        return FaceKps(earProxy: earProxy, yaw: yaw)
    }

    private func detectBlink(_ series: [Float]) -> Bool {
        guard series.count >= 2 else { return false }
        var run = 0; var maxRun = 0
        for v in series {
            if v < blinkEarThresh { run += 1; maxRun = max(maxRun, run) } else { run = 0 }
        }
        return maxRun >= 2
    }

    private func generateBlazeFaceAnchors() -> [[Float]] {
        let strides = [8, 16]
        let apc = [2, 6]
        var anchors = [[Float]]()
        anchors.reserveCapacity(896)
        for s in strides.indices {
            let cells = bfSize / strides[s]
            for row in 0 ..< cells {
                for col in 0 ..< cells {
                    let cx = (Float(col) + 0.5) / Float(cells)
                    let cy = (Float(row) + 0.5) / Float(cells)
                    for _ in 0 ..< apc[s] { anchors.append([cx, cy]) }
                }
            }
        }
        return anchors
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
        let normB = l2norm(b)
        var dot: Float = 0
        for i in 0 ..< min(a.count, b.count) { dot += a[i] * b[i] }
        return max(-1, min(1, dot / (normA * normB)))
    }
    private func sigmoid(_ x: Float) -> Float { 1 / (1 + exp(-x)) }
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
        guard let cgImg = cgImage else { return nil }
        let w = cgImg.width; let h = cgImg.height
        var data = [UInt8](repeating: 0, count: w * h * 3)
        let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8,
                           bytesPerRow: w * 3, space: CGColorSpaceCreateDeviceRGB(),
                           bitmapInfo: CGImageAlphaInfo.none.rawValue)
        ctx?.draw(cgImg, in: CGRect(x: 0, y: 0, width: w, height: h))
        return data
    }
}

private extension Array where Element == Float {
    var average: Double { isEmpty ? 0.0 : Double(reduce(0, +)) / Double(count) }
}
