package com.pehchaanrnscaffold

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RectF
import android.util.Base64
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/**
 * React Native bridge for offline face recognition and liveness detection.
 *
 * Models bundled in assets/:
 *   mobilefacenet_indian.tflite — INT8, 512-d embeddings, Indian demographic fine-tuned
 *   blazeface.tflite            — float32, 128×128 input, 896 anchors × 16 regressors
 *
 * JS interface (NativeModules.FaceRecognition):
 *   runInference(faceFrameBase64, candidatesJson, threshold) → NativeInferenceOutput
 *   checkLiveness(framesBase64[], challenge) → LivenessResult
 */
class FaceRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "FaceRecognition"
        private const val MFN_SIZE = 112       // MobileFaceNet input size
        private const val BF_SIZE = 128        // BlazeFace input size
        private const val EMBED_DIM = 512      // MobileFaceNet embedding dimension
        private const val BF_SCORE_THRESH = 0.5f
        private const val BF_SCALE = 128f      // BlazeFace decode scale = input size
        private const val BLINK_EAR_THRESH = 0.25f
        private const val BLINK_MIN_FRAMES = 2
        private const val YAW_TURN_THRESH = 15f
        private const val YAW_FRAME_RATIO = 0.4f
    }

    override fun getName() = MODULE_NAME

    // Lazy-loaded interpreters — allocated only when first called
    private val mfnInterpreter: Interpreter by lazy { loadModel("mobilefacenet_indian.tflite") }
    private val bfInterpreter: Interpreter by lazy { loadModel("blazeface.tflite") }
    private val bfAnchors: List<FloatArray> by lazy { generateBlazeFaceAnchors() }
    private var bfRegressorsOutputIdx = 0
    private var bfScoresOutputIdx = 1

    private fun loadModel(fileName: String): Interpreter {
        val fd = reactApplicationContext.assets.openFd(fileName)
        val bytes = fd.createInputStream().use { it.readBytes() }
        fd.close()
        val buf = ByteBuffer.allocateDirect(bytes.size).apply {
            order(ByteOrder.nativeOrder())
            put(bytes)
            rewind()
        }
        val interp = Interpreter(buf, Interpreter.Options().apply { setNumThreads(4) })
        // For BlazeFace: identify output indices by tensor shape
        if (fileName.contains("blazeface")) {
            for (i in 0 until interp.outputTensorCount) {
                val shape = interp.getOutputTensor(i).shape()
                if (shape.size == 3 && shape[2] == 16) bfRegressorsOutputIdx = i
                if (shape.size == 3 && shape[2] == 1) bfScoresOutputIdx = i
            }
        }
        return interp
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Face Recognition
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Run face recognition against a list of enrolled workers.
     *
     * @param faceFrameBase64  Base64 JPEG/PNG of the face crop (any size, will be resized to 112×112)
     * @param candidatesJson   JSON array of WorkerEmbeddingEntry objects
     * @param threshold        Minimum cosine similarity to report a match (e.g. 0.30)
     * @param promise          Resolves with NativeInferenceOutput
     */
    @ReactMethod
    fun runInference(
        faceFrameBase64: String,
        candidatesJson: String,
        threshold: Double,
        promise: Promise,
    ) {
        try {
            val t0 = System.currentTimeMillis()

            // Decode image
            val bytes = Base64.decode(faceFrameBase64, Base64.DEFAULT)
            val src = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw IllegalArgumentException("Could not decode image")
            val bmp = Bitmap.createScaledBitmap(src, MFN_SIZE, MFN_SIZE, true)

            // Quantisation params from model (avoids hardcoding scale/zp)
            val inputTensor = mfnInterpreter.getInputTensor(0)
            val scale = inputTensor.quantizationParams().scale.takeIf { it > 0f } ?: 0.00784f
            val zp = inputTensor.quantizationParams().zeroPoint

            // Build INT8 input buffer: NHWC, normalised to [-1, 1] then quantised
            val inputBuf = ByteBuffer.allocateDirect(MFN_SIZE * MFN_SIZE * 3)
                .apply { order(ByteOrder.nativeOrder()) }
            for (y in 0 until MFN_SIZE) {
                for (x in 0 until MFN_SIZE) {
                    val px = bmp.getPixel(x, y)
                    inputBuf.put(quantize(Color.red(px) / 127.5f - 1f, scale, zp))
                    inputBuf.put(quantize(Color.green(px) / 127.5f - 1f, scale, zp))
                    inputBuf.put(quantize(Color.blue(px) / 127.5f - 1f, scale, zp))
                }
            }
            inputBuf.rewind()

            // Run MobileFaceNet
            val output = Array(1) { FloatArray(EMBED_DIM) }
            mfnInterpreter.run(inputBuf, output)
            val queryEmb = output[0]
            val queryNorm = l2norm(queryEmb)

            // Compare against each candidate
            var bestId: String? = null
            var bestScore = 0f
            val candidates = JSONArray(candidatesJson)
            for (i in 0 until candidates.length()) {
                val entry = candidates.getJSONObject(i)
                if (entry.optBoolean("isRevoked", false)) continue
                val embBytes = Base64.decode(entry.getString("embeddingBase64"), Base64.DEFAULT)
                val embFloat = FloatArray(embBytes.size / 4)
                ByteBuffer.wrap(embBytes).order(ByteOrder.LITTLE_ENDIAN)
                    .asFloatBuffer().get(embFloat)
                val score = cosine(queryEmb, queryNorm, embFloat)
                if (score > bestScore) {
                    bestScore = score
                    bestId = entry.getString("workerId")
                }
            }

            val inferenceMs = System.currentTimeMillis() - t0
            promise.resolve(Arguments.createMap().apply {
                putString("workerId", if (bestScore >= threshold.toFloat()) bestId else null)
                putDouble("confidence", bestScore.toDouble())
                putDouble("inferenceMs", inferenceMs.toDouble())
                putDouble("qualityScore", 1.0)
            })
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", e.message ?: "Unknown error", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liveness Detection
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Evaluate a liveness challenge across a sequence of camera frames.
     *
     * @param framesBase64  ReadableArray of base64 JPEG frames (full camera resolution)
     * @param challenge     "blink" | "turn_left" | "turn_right"
     * @param promise       Resolves with LivenessResult (passed, ear?, yawDegrees?, durationMs)
     */
    @ReactMethod
    fun checkLiveness(
        framesBase64: ReadableArray,
        challenge: String,
        promise: Promise,
    ) {
        try {
            val t0 = System.currentTimeMillis()
            val earSeries = mutableListOf<Float>()
            val yawSeries = mutableListOf<Float>()

            for (i in 0 until framesBase64.size()) {
                val imgBytes = Base64.decode(framesBase64.getString(i)!!, Base64.DEFAULT)
                val bmp = BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size) ?: continue
                val kps = runBlazeFace(bmp) ?: continue
                earSeries.add(kps.earProxy)
                yawSeries.add(kps.yawDegrees)
            }

            val durationMs = System.currentTimeMillis() - t0
            val result = Arguments.createMap()
            result.putDouble("durationMs", durationMs.toDouble())

            when (challenge) {
                "blink" -> {
                    val passed = detectBlink(earSeries)
                    result.putBoolean("passed", passed)
                    result.putDouble("ear", earSeries.averageOrZero())
                }
                "turn_left" -> {
                    val passed = yawSeries.count { it < -YAW_TURN_THRESH } >= (yawSeries.size * YAW_FRAME_RATIO)
                    result.putBoolean("passed", passed)
                    result.putDouble("yawDegrees", yawSeries.averageOrZero())
                }
                "turn_right" -> {
                    val passed = yawSeries.count { it > YAW_TURN_THRESH } >= (yawSeries.size * YAW_FRAME_RATIO)
                    result.putBoolean("passed", passed)
                    result.putDouble("yawDegrees", yawSeries.averageOrZero())
                }
                else -> result.putBoolean("passed", false)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIVENESS_ERROR", e.message ?: "Unknown error", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BlazeFace inference + keypoint decoding
    // ─────────────────────────────────────────────────────────────────────────

    private data class FaceKeypoints(val earProxy: Float, val yawDegrees: Float)

    private fun runBlazeFace(src: Bitmap): FaceKeypoints? {
        val bmp = Bitmap.createScaledBitmap(src, BF_SIZE, BF_SIZE, true)

        // Float32 input [1, 128, 128, 3] in [0, 1]
        val inputBuf = ByteBuffer.allocateDirect(BF_SIZE * BF_SIZE * 3 * 4)
            .apply { order(ByteOrder.nativeOrder()) }
        for (y in 0 until BF_SIZE) {
            for (x in 0 until BF_SIZE) {
                val px = bmp.getPixel(x, y)
                inputBuf.putFloat(Color.red(px) / 255f)
                inputBuf.putFloat(Color.green(px) / 255f)
                inputBuf.putFloat(Color.blue(px) / 255f)
            }
        }
        inputBuf.rewind()

        // Outputs: regressors [1,896,16], scores [1,896,1]
        val regressors = Array(1) { Array(896) { FloatArray(16) } }
        val scores = Array(1) { Array(896) { FloatArray(1) } }
        val outputs = mapOf<Int, Any>(
            bfRegressorsOutputIdx to regressors,
            bfScoresOutputIdx to scores,
        )
        bfInterpreter.runForMultipleInputsOutputs(arrayOf<Any>(inputBuf), outputs)

        // Pick best anchor above threshold
        var bestScore = BF_SCORE_THRESH
        var bestIdx = -1
        for (i in 0 until 896) {
            val s = sigmoid(scores[0][i][0])
            if (s > bestScore) { bestScore = s; bestIdx = i }
        }
        if (bestIdx < 0) return null

        return decodeKeypoints(regressors[0][bestIdx], bfAnchors[bestIdx])
    }

    /**
     * Decode raw BlazeFace regressor into face keypoints.
     *
     * Keypoint order: [right_eye, left_eye, nose_tip, mouth, right_ear, left_ear]
     * Encoding: alternating [y_offset, x_offset] pairs after the 4 bbox values.
     *
     * EAR proxy: ratio of (eye_y to mouth_y) distance vs face height.
     *   Open eyes → ~0.35–0.50. Closed eyes → ~0.20–0.28.
     *
     * Yaw estimate: nose_x offset from eye midpoint, normalised by face width.
     *   Straight ahead → ~0°. Turn left → negative. Turn right → positive.
     */
    private fun decodeKeypoints(raw: FloatArray, anchor: FloatArray): FaceKeypoints {
        val anchorCx = anchor[0]
        val anchorCy = anchor[1]
        val faceW = (raw[3] / BF_SCALE).coerceAtLeast(0.01f)
        val faceH = (raw[2] / BF_SCALE).coerceAtLeast(0.01f)

        val kpX = FloatArray(6)
        val kpY = FloatArray(6)
        for (i in 0 until 6) {
            kpX[i] = raw[4 + i * 2 + 1] / BF_SCALE + anchorCx
            kpY[i] = raw[4 + i * 2]     / BF_SCALE + anchorCy
        }

        // EAR proxy: vertical eye-to-mouth distance relative to face height
        val eyeMidY = (kpY[0] + kpY[1]) / 2f
        val mouthY = kpY[3]
        val earProxy = ((mouthY - eyeMidY) / faceH).coerceIn(0f, 1f)

        // Yaw: nose offset from eye midpoint, mapped to degrees
        val eyeMidX = (kpX[0] + kpX[1]) / 2f
        val noseX = kpX[2]
        val yawDegrees = ((noseX - eyeMidX) / faceW) * 90f

        return FaceKeypoints(earProxy = earProxy, yawDegrees = yawDegrees)
    }

    private fun detectBlink(earSeries: List<Float>): Boolean {
        if (earSeries.size < BLINK_MIN_FRAMES) return false
        var runLength = 0
        var maxRun = 0
        for (v in earSeries) {
            if (v < BLINK_EAR_THRESH) { runLength++; maxRun = maxOf(maxRun, runLength) }
            else runLength = 0
        }
        return maxRun >= BLINK_MIN_FRAMES
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BlazeFace anchor generation
    // Short-range 128×128: strides [8, 16], anchors-per-cell [2, 6] → 896 total
    // ─────────────────────────────────────────────────────────────────────────

    private fun generateBlazeFaceAnchors(): List<FloatArray> {
        val strides = intArrayOf(8, 16)
        val apc = intArrayOf(2, 6)
        val anchors = ArrayList<FloatArray>(896)
        for (s in strides.indices) {
            val cells = BF_SIZE / strides[s]
            for (row in 0 until cells) {
                for (col in 0 until cells) {
                    val cx = (col + 0.5f) / cells
                    val cy = (row + 0.5f) / cells
                    repeat(apc[s]) { anchors.add(floatArrayOf(cx, cy)) }
                }
            }
        }
        return anchors  // size = 16*16*2 + 8*8*6 = 512 + 384 = 896
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Math helpers
    // ─────────────────────────────────────────────────────────────────────────

    private fun quantize(v: Float, scale: Float, zp: Int): Byte =
        (v / scale + zp).roundToInt().coerceIn(-128, 127).toByte()

    private fun l2norm(v: FloatArray): Float {
        var s = 0f; for (x in v) s += x * x; return sqrt(s).coerceAtLeast(1e-10f)
    }

    private fun cosine(a: FloatArray, aNorm: Float, b: FloatArray): Float {
        val bNorm = l2norm(b)
        var dot = 0f
        for (i in 0 until minOf(a.size, b.size)) dot += a[i] * b[i]
        return (dot / (aNorm * bNorm)).coerceIn(-1f, 1f)
    }

    private fun sigmoid(x: Float) = 1f / (1f + exp(-x))

    private fun List<Float>.averageOrZero() = if (isEmpty()) 0.0 else average()
}
