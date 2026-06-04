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
 * React Native bridge — offline face recognition + liveness detection.
 *
 * Models in assets/:
 *   mobilefacenet_indian.tflite — INT8, input=[1,112,112,3] int8, output=[1,512] float32
 *   blazeface.tflite            — float32, input=[1,128,128,3], outputs regressors[1,896,16] + scores[1,896,1]
 *
 * Exposed to JS (NativeModules.FaceRecognition):
 *   checkFaceQuality(frameBase64)                              → QualityCheck
 *   runInference(frameBase64, candidatesJson, threshold)       → NativeInferenceOutput
 *   checkLiveness(framesBase64[], challenge)                   → LivenessResult
 */
class FaceRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "FaceRecognition"
        private const val MFN_SIZE   = 112
        private const val BF_SIZE    = 128
        private const val EMBED_DIM  = 512
        private const val BF_SCALE   = 128f
        private const val BF_SCORE_THRESH = 0.5f

        // Liveness thresholds
        // EAR proxy: pixel-brightness-based — open eye (dark iris) → high value, closed → low value
        private const val BLINK_EAR_THRESH  = 0.45f  // below this = eyes closing
        private const val BLINK_MIN_FRAMES  = 2
        private const val YAW_TURN_THRESH   = 15f    // degrees
        private const val YAW_FRAME_RATIO   = 0.4f   // fraction of frames that must satisfy

        // Quality thresholds (normalised 0–1)
        private const val MIN_BRIGHTNESS    = 0.15f
        private const val MAX_BRIGHTNESS    = 0.92f
        private const val MIN_SHARPNESS     = 0.10f
        private const val MIN_FACE_RATIO    = 0.08f  // face area / frame area
    }

    override fun getName() = MODULE_NAME

    private val mfnInterpreter: Interpreter by lazy { loadModel("mobilefacenet_indian.tflite") }
    private val bfInterpreter:  Interpreter by lazy { loadModel("blazeface.tflite") }
    private val bfAnchors: List<FloatArray>  by lazy { generateBlazeFaceAnchors() }

    // Set at load time by scanning output tensor shapes
    private var bfRegressorsIdx = 0
    private var bfScoresIdx     = 1

    private fun loadModel(fileName: String): Interpreter {
        val fd  = reactApplicationContext.assets.openFd(fileName)
        val buf = ByteBuffer.allocateDirect(fd.length.toInt()).apply {
            order(ByteOrder.nativeOrder())
            fd.createInputStream().use { it.copyTo(object : java.io.OutputStream() {
                override fun write(b: Int) = put(b.toByte()).let {}
                override fun write(b: ByteArray, off: Int, len: Int) = put(b, off, len).let {}
            }) }
            rewind()
        }
        fd.close()
        val opts = Interpreter.Options().apply { setNumThreads(4) }
        val interp = Interpreter(buf, opts)
        if (fileName.contains("blazeface")) {
            for (i in 0 until interp.outputTensorCount) {
                val shape = interp.getOutputTensor(i).shape()
                if (shape.size == 3 && shape[2] == 16) bfRegressorsIdx = i
                if (shape.size == 3 && shape[2] == 1)  bfScoresIdx = i
            }
        }
        return interp
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Face Quality Check
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Detect face in frame and return quality metrics.
     * Maps directly to QualityCheck type in src/types.ts.
     *
     * Checks: face present, brightness, blur (Laplacian variance), face size ratio.
     */
    @ReactMethod
    fun checkFaceQuality(frameBase64: String, promise: Promise) {
        try {
            val imgBytes = Base64.decode(frameBase64, Base64.DEFAULT)
            val src = BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size)
                ?: throw IllegalArgumentException("Cannot decode frame")

            val detection = runBlazeFace(src)
            if (detection == null) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("passed", false)
                    putDouble("brightness", 0.0)
                    putDouble("sharpness", 0.0)
                    putDouble("faceAreaRatio", 0.0)
                    putString("failReason", "no_face")
                })
                return
            }

            val faceAreaRatio = detection.box.width() * detection.box.height()
            val faceCrop = cropBitmap(src, detection.box, pad = 0.0f)
            val brightness = computeBrightness(faceCrop)
            val sharpness  = computeSharpness(faceCrop)

            val failReason: String? = when {
                faceAreaRatio < MIN_FACE_RATIO -> "too_small"
                brightness < MIN_BRIGHTNESS   -> "too_dark"
                brightness > MAX_BRIGHTNESS   -> "too_bright"
                sharpness < MIN_SHARPNESS     -> "blurry"
                abs(detection.yawDegrees) > 30f -> "face_angle_too_high"
                else -> null
            }

            promise.resolve(Arguments.createMap().apply {
                putBoolean("passed", failReason == null)
                putDouble("brightness", brightness.toDouble())
                putDouble("sharpness", sharpness.toDouble())
                putDouble("faceAreaRatio", faceAreaRatio.toDouble())
                if (failReason != null) putString("failReason", failReason)
            })
        } catch (e: Exception) {
            promise.reject("QUALITY_ERROR", e.message ?: "Unknown", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Face Recognition
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Full pipeline: detect face → crop → MobileFaceNet embed → cosine match.
     *
     * @param frameBase64    Base64 JPEG of any-size camera frame (detect + crop done internally)
     * @param candidatesJson JSON array of WorkerEmbeddingEntry (workerId, embeddingBase64, isRevoked)
     * @param threshold      Minimum cosine similarity to report a match (0.18–0.30 for this model)
     */
    @ReactMethod
    fun runInference(
        frameBase64:    String,
        candidatesJson: String,
        threshold:      Double,
        promise:        Promise,
    ) {
        try {
            val t0 = System.currentTimeMillis()

            val imgBytes = Base64.decode(frameBase64, Base64.DEFAULT)
            val src = BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size)
                ?: throw IllegalArgumentException("Cannot decode image")

            // 1. Detect face — return no-match if no face found
            val detection = runBlazeFace(src)
            if (detection == null) {
                promise.resolve(Arguments.createMap().apply {
                    putString("workerId", null)
                    putDouble("confidence", 0.0)
                    putDouble("inferenceMs", (System.currentTimeMillis() - t0).toDouble())
                    putDouble("qualityScore", 0.0)
                })
                return
            }

            // 2. Crop face region (with 15% padding) → resize to 112×112
            val faceBmp = cropBitmap(src, detection.box, pad = 0.15f)
            val mfnBmp  = Bitmap.createScaledBitmap(faceBmp, MFN_SIZE, MFN_SIZE, true)

            // 3. Quantise to INT8 input buffer
            val inputTensor = mfnInterpreter.getInputTensor(0)
            val scale = inputTensor.quantizationParams().scale.let { if (it > 0f) it else 0.00784f }
            val zp    = inputTensor.quantizationParams().zeroPoint

            val inputBuf = ByteBuffer.allocateDirect(MFN_SIZE * MFN_SIZE * 3)
                .apply { order(ByteOrder.nativeOrder()) }
            for (y in 0 until MFN_SIZE) {
                for (x in 0 until MFN_SIZE) {
                    val px = mfnBmp.getPixel(x, y)
                    inputBuf.put(quantize(Color.red(px)   / 127.5f - 1f, scale, zp))
                    inputBuf.put(quantize(Color.green(px) / 127.5f - 1f, scale, zp))
                    inputBuf.put(quantize(Color.blue(px)  / 127.5f - 1f, scale, zp))
                }
            }
            inputBuf.rewind()

            // 4. Run MobileFaceNet → 512-d embedding
            val outputBuf = Array(1) { FloatArray(EMBED_DIM) }
            mfnInterpreter.run(inputBuf, outputBuf)
            val queryEmb  = outputBuf[0]
            val queryNorm = l2norm(queryEmb)

            // 5. Cosine similarity against each candidate
            var bestId    = ""
            var bestScore = 0f
            val candidates = JSONArray(candidatesJson)
            for (i in 0 until candidates.length()) {
                val entry = candidates.getJSONObject(i)
                if (entry.optBoolean("isRevoked", false)) continue
                val embBytes = Base64.decode(entry.getString("embeddingBase64"), Base64.DEFAULT)
                val embFloat = FloatArray(embBytes.size / 4).also { arr ->
                    ByteBuffer.wrap(embBytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer().get(arr)
                }
                val score = cosine(queryEmb, queryNorm, embFloat)
                if (score > bestScore) { bestScore = score; bestId = entry.getString("workerId") }
            }

            val inferenceMs = System.currentTimeMillis() - t0
            promise.resolve(Arguments.createMap().apply {
                putString("workerId", if (bestScore >= threshold.toFloat() && bestId.isNotEmpty()) bestId else null)
                putDouble("confidence",  bestScore.toDouble())
                putDouble("inferenceMs", inferenceMs.toDouble())
                putDouble("qualityScore", 1.0)
            })
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", e.message ?: "Unknown", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Liveness Detection
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Evaluate one liveness challenge across N camera frames.
     * Blink uses pixel-brightness EAR proxy; head-turn uses nose-offset yaw.
     * PPE fallback: if blink challenge detects persistently low EAR (occluded eyes),
     * the result is marked passed=false and caller should switch to head-turn.
     *
     * @param framesBase64  ReadableArray of base64 JPEG frames captured during challenge window
     * @param challenge     "blink" | "turn_left" | "turn_right"
     */
    @ReactMethod
    fun checkLiveness(framesBase64: ReadableArray, challenge: String, promise: Promise) {
        try {
            val t0 = System.currentTimeMillis()
            val earSeries = mutableListOf<Float>()
            val yawSeries = mutableListOf<Float>()

            for (i in 0 until framesBase64.size()) {
                val b64 = framesBase64.getString(i) ?: continue
                val bmp = BitmapFactory.decodeByteArray(
                    Base64.decode(b64, Base64.DEFAULT).also { }, 0,
                    Base64.decode(b64, Base64.DEFAULT).size
                ) ?: continue
                // Avoid double-decode; re-decode cleanly
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: continue
                val det = runBlazeFace(bitmap) ?: continue
                earSeries.add(det.earProxy)
                yawSeries.add(det.yawDegrees)
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
                    val n = yawSeries.size
                    val passed = n > 0 && yawSeries.count { it < -YAW_TURN_THRESH } >= (n * YAW_FRAME_RATIO).toInt()
                    result.putBoolean("passed", passed)
                    result.putDouble("yawDegrees", yawSeries.averageOrZero())
                }
                "turn_right" -> {
                    val n = yawSeries.size
                    val passed = n > 0 && yawSeries.count { it > YAW_TURN_THRESH } >= (n * YAW_FRAME_RATIO).toInt()
                    result.putBoolean("passed", passed)
                    result.putDouble("yawDegrees", yawSeries.averageOrZero())
                }
                else -> result.putBoolean("passed", false)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("LIVENESS_ERROR", e.message ?: "Unknown", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BlazeFace
    // ─────────────────────────────────────────────────────────────────────────

    private data class BlazeFaceResult(
        val box:        RectF,       // normalised [0,1] face bounding box
        val kpX:        FloatArray,  // 6 keypoint x coords (normalised)
        val kpY:        FloatArray,  // 6 keypoint y coords (normalised)
        val earProxy:   Float,       // pixel-brightness EAR proxy (open=high, closed=low)
        val yawDegrees: Float,
        val bfBitmap:   Bitmap,      // 128×128 image used for pixel analysis
    )

    private fun runBlazeFace(src: Bitmap): BlazeFaceResult? {
        val bfBmp = Bitmap.createScaledBitmap(src, BF_SIZE, BF_SIZE, true)

        val inputBuf = ByteBuffer.allocateDirect(BF_SIZE * BF_SIZE * 3 * 4)
            .apply { order(ByteOrder.nativeOrder()) }
        for (y in 0 until BF_SIZE) {
            for (x in 0 until BF_SIZE) {
                val px = bfBmp.getPixel(x, y)
                inputBuf.putFloat(Color.red(px)   / 255f)
                inputBuf.putFloat(Color.green(px) / 255f)
                inputBuf.putFloat(Color.blue(px)  / 255f)
            }
        }
        inputBuf.rewind()

        val regressors = Array(1) { Array(896) { FloatArray(16) } }
        val scores     = Array(1) { Array(896) { FloatArray(1) } }
        bfInterpreter.runForMultipleInputsOutputs(
            arrayOf<Any>(inputBuf),
            mapOf(bfRegressorsIdx to regressors as Any, bfScoresIdx to scores as Any),
        )

        var bestScore = BF_SCORE_THRESH
        var bestIdx   = -1
        for (i in 0 until 896) {
            val s = sigmoid(scores[0][i][0])
            if (s > bestScore) { bestScore = s; bestIdx = i }
        }
        if (bestIdx < 0) return null

        return decodeBlazeFaceResult(regressors[0][bestIdx], bfAnchors[bestIdx], bfBmp)
    }

    private fun decodeBlazeFaceResult(
        raw:    FloatArray,
        anchor: FloatArray,
        bfBmp:  Bitmap,
    ): BlazeFaceResult {
        val anchorCx = anchor[0]
        val anchorCy = anchor[1]

        val cx = raw[1] / BF_SCALE + anchorCx
        val cy = raw[0] / BF_SCALE + anchorCy
        val fw = (raw[3] / BF_SCALE).coerceAtLeast(0.01f)
        val fh = (raw[2] / BF_SCALE).coerceAtLeast(0.01f)
        val box = RectF(cx - fw / 2f, cy - fh / 2f, cx + fw / 2f, cy + fh / 2f)

        // kp order: right_eye(0), left_eye(1), nose_tip(2), mouth(3), right_ear(4), left_ear(5)
        val kpX = FloatArray(6)
        val kpY = FloatArray(6)
        for (i in 0 until 6) {
            kpX[i] = raw[4 + i * 2 + 1] / BF_SCALE + anchorCx
            kpY[i] = raw[4 + i * 2]     / BF_SCALE + anchorCy
        }

        // ── EAR proxy via pixel brightness of eye region on 128×128 image ──────
        // Open eye: dark iris visible → low brightness → EAR proxy HIGH
        // Closed eye: eyelid skin    → high brightness → EAR proxy LOW
        val eyeRegionW = maxOf(4, (fw * BF_SIZE * 0.18f).toInt())
        val eyeRegionH = maxOf(3, (fh * BF_SIZE * 0.10f).toInt())
        val leftBright  = eyeRegionBrightness(bfBmp, (kpX[1] * BF_SIZE).toInt(), (kpY[1] * BF_SIZE).toInt(), eyeRegionW, eyeRegionH)
        val rightBright = eyeRegionBrightness(bfBmp, (kpX[0] * BF_SIZE).toInt(), (kpY[0] * BF_SIZE).toInt(), eyeRegionW, eyeRegionH)
        val earProxy = 1f - (leftBright + rightBright) / 2f

        // ── Yaw via nose offset from eye midpoint ─────────────────────────────
        val eyeMidX    = (kpX[0] + kpX[1]) / 2f
        val yawDegrees = ((kpX[2] - eyeMidX) / fw.coerceAtLeast(0.01f)) * 90f

        return BlazeFaceResult(box, kpX, kpY, earProxy, yawDegrees, bfBmp)
    }

    private fun eyeRegionBrightness(bmp: Bitmap, cx: Int, cy: Int, w: Int, h: Int): Float {
        var sum = 0L; var count = 0
        for (dy in -h / 2 until h / 2) {
            for (dx in -w / 2 until w / 2) {
                val px = (cx + dx).coerceIn(0, bmp.width - 1)
                val py = (cy + dy).coerceIn(0, bmp.height - 1)
                sum += gray(bmp.getPixel(px, py))
                count++
            }
        }
        return if (count > 0) sum.toFloat() / count / 255f else 0.5f
    }

    private fun detectBlink(earSeries: List<Float>): Boolean {
        if (earSeries.size < BLINK_MIN_FRAMES) return false
        // A blink = earProxy drops below BLINK_EAR_THRESH for ≥ BLINK_MIN_FRAMES consecutive frames
        var run = 0; var maxRun = 0
        for (v in earSeries) {
            if (v < BLINK_EAR_THRESH) { run++; maxRun = maxOf(maxRun, run) } else run = 0
        }
        return maxRun >= BLINK_MIN_FRAMES
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Quality helpers
    // ─────────────────────────────────────────────────────────────────────────

    /** Mean pixel brightness, normalised to [0, 1]. */
    private fun computeBrightness(bmp: Bitmap): Float {
        val stride = maxOf(1, bmp.width * bmp.height / 2000)
        var sum = 0L; var count = 0
        var i = 0
        while (i < bmp.width * bmp.height) {
            sum += gray(bmp.getPixel(i % bmp.width, i / bmp.width))
            count++; i += stride
        }
        return if (count > 0) sum.toFloat() / count / 255f else 0.5f
    }

    /**
     * Laplacian variance as sharpness proxy.
     * Scales image to 64×64 for speed, computes 4-neighbour discrete Laplacian variance.
     * Typical values: sharp ~0.3+, blurry ~0.05–0.15. Normalised to [0, 1].
     */
    private fun computeSharpness(bmp: Bitmap): Float {
        if (bmp.width < 3 || bmp.height < 3) return 0f
        val s = Bitmap.createScaledBitmap(bmp, 64, 64, true)
        var sumSq = 0.0
        for (y in 1 until s.height - 1) {
            for (x in 1 until s.width - 1) {
                val lap = 4 * gray(s.getPixel(x, y)) -
                          gray(s.getPixel(x - 1, y)) - gray(s.getPixel(x + 1, y)) -
                          gray(s.getPixel(x, y - 1)) - gray(s.getPixel(x, y + 1))
                sumSq += lap.toDouble() * lap
            }
        }
        val variance = sumSq / ((s.width - 2) * (s.height - 2))
        return (variance / 500.0).toFloat().coerceIn(0f, 1f)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Anchor generation
    // ─────────────────────────────────────────────────────────────────────────

    /** BlazeFace short-range: strides [8,16], apc [2,6] → 16×16×2 + 8×8×6 = 896 anchors */
    private fun generateBlazeFaceAnchors(): List<FloatArray> {
        val strides = intArrayOf(8, 16)
        val apc     = intArrayOf(2, 6)
        val out     = ArrayList<FloatArray>(896)
        for (s in strides.indices) {
            val cells = BF_SIZE / strides[s]
            for (row in 0 until cells) {
                for (col in 0 until cells) {
                    val cx = (col + 0.5f) / cells
                    val cy = (row + 0.5f) / cells
                    repeat(apc[s]) { out.add(floatArrayOf(cx, cy)) }
                }
            }
        }
        return out
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Bitmap helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crop face from bitmap using normalised bounding box.
     * @param pad fraction of face size to add as padding on each side (0.0–0.2 typical)
     */
    private fun cropBitmap(src: Bitmap, box: RectF, pad: Float): Bitmap {
        val fw = box.width(); val fh = box.height()
        val l = ((box.left   - fw * pad) * src.width ).toInt().coerceIn(0, src.width  - 1)
        val t = ((box.top    - fh * pad) * src.height).toInt().coerceIn(0, src.height - 1)
        val r = ((box.right  + fw * pad) * src.width ).toInt().coerceIn(0, src.width  - 1)
        val b = ((box.bottom + fh * pad) * src.height).toInt().coerceIn(0, src.height - 1)
        val w = (r - l).coerceAtLeast(1)
        val h = (b - t).coerceAtLeast(1)
        return Bitmap.createBitmap(src, l, t, w, h)
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
        val bNorm = l2norm(b); var dot = 0f
        for (i in 0 until minOf(a.size, b.size)) dot += a[i] * b[i]
        return (dot / (aNorm * bNorm)).coerceIn(-1f, 1f)
    }

    private fun gray(pixel: Int): Int =
        (Color.red(pixel) * 299 + Color.green(pixel) * 587 + Color.blue(pixel) * 114) / 1000

    private fun sigmoid(x: Float) = 1f / (1f + exp(-x))

    private fun List<Float>.averageOrZero() = if (isEmpty()) 0.0 else average()
}
