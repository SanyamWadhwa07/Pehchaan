#!/usr/bin/env node
/**
 * N6 — Auth pipeline stage timings (Node harness, no Metro / no native bridge).
 *
 * Runs **BENCHMARK_ITERATIONS** cycles (default **50**) and prints **P50 / P95** (and min/max)
 * per stage, analogous to the JS orchestration around:
 *   `checkFaceQuality` → `runRecognition` → `checkLiveness`
 *
 * **Not** on-device TFLite latency — see `ml/PROGRESS_SANYAM.md` and native `inferenceMs` from
 * `FaceRecognition.runInference`. Keep tier thresholds aligned with `src/constants/auth.ts`.
 *
 * Environment:
 *   BENCHMARK_ITERATIONS  — default `50`
 *   BENCHMARK_JITTER_MS   — default `0`; max uniform random sleep **per stage** (ms) to smoke-test spread
 *
 * Run:
 *   node scripts/benchmark-auth-stages.mjs
 *   npm run benchmark:auth
 */

/** @see src/constants/auth.ts — keep in sync */
const CONFIDENCE_THRESHOLD_HIGH = 0.3;
const CONFIDENCE_THRESHOLD_MEDIUM = 0.2;

/** @see src/lib/authTier.ts */
function authTierFromConfidence(confidence) {
  if (confidence > CONFIDENCE_THRESHOLD_HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLD_MEDIUM) return 'medium';
  return 'low';
}

function sleepMs(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

function randMs(max) {
  if (!(max > 0)) return 0;
  return Math.random() * max;
}

async function stageQuality(jitterMs) {
  const t0 = performance.now();
  await sleepMs(randMs(jitterMs));
  const passed = Math.random() > 0.12;
  const qc = JSON.stringify({
    passed,
    brightness: passed ? 0.55 : 0.22,
    sharpness: passed ? 0.72 : 0.28,
    faceAreaRatio: passed ? 0.42 : 0.09,
  });
  void qc;
  return performance.now() - t0;
}

async function stageRecognition(jitterMs) {
  const t0 = performance.now();
  await sleepMs(randMs(jitterMs));
  const confidence = 0.85;
  const authTier = authTierFromConfidence(confidence);
  const payload = JSON.stringify({
    workerId: '00000000-0000-4000-8000-000000000001',
    confidence,
    authTier,
    inferenceMs: 48,
  });
  void payload;
  return performance.now() - t0;
}

async function stageLiveness(jitterMs) {
  const t0 = performance.now();
  await sleepMs(randMs(jitterMs));
  const frames = [0, 1, 2].map((i) => `data:image/jpeg;base64,${'x'.repeat(400 + i)}`);
  let acc = 0;
  for (const f of frames) {
    acc += f.length;
  }
  const res = JSON.stringify({
    challenge: 'blink',
    passed: true,
    durationMs: 120 + (acc % 40),
  });
  void res;
  return performance.now() - t0;
}

/** Inclusive quantile q ∈ [0, 1], linear interpolation between sorted samples. */
function quantile(sorted, q) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function stats(name, samples) {
  const s = [...samples].sort((a, b) => a - b);
  return {
    stage: name,
    n: s.length,
    p50: quantile(s, 0.5),
    p95: quantile(s, 0.95),
    min: s[0],
    max: s[s.length - 1],
  };
}

function fmt(x) {
  if (!Number.isFinite(x)) return 'n/a';
  return x.toFixed(3);
}

async function main() {
  const n = Math.max(1, parseInt(String(process.env.BENCHMARK_ITERATIONS || '50'), 10) || 50);
  const jitter = Math.max(
    0,
    parseFloat(String(process.env.BENCHMARK_JITTER_MS || '0')) || 0,
  );

  const quality = [];
  const recognition = [];
  const liveness = [];
  const total = [];

  for (let i = 0; i < n; i++) {
    const tAll = performance.now();
    quality.push(await stageQuality(jitter));
    recognition.push(await stageRecognition(jitter));
    liveness.push(await stageLiveness(jitter));
    total.push(performance.now() - tAll);
  }

  const rows = [
    stats('quality (JS harness)', quality),
    stats('recognition (tier + JSON)', recognition),
    stats('liveness (frames + JSON)', liveness),
    stats('total_cycle (wall)', total),
  ];

  console.log('');
  console.log('Pehchaan — auth stage benchmark (N6 Node harness)');
  console.log(`  iterations=${n}  BENCHMARK_JITTER_MS=${jitter}`);
  console.log('');
  console.log('| stage | n | min (ms) | P50 (ms) | P95 (ms) | max (ms) |');
  console.log('|-------|---|----------|----------|----------|----------|');
  for (const r of rows) {
    console.log(
      `| ${r.stage} | ${r.n} | ${fmt(r.min)} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.max)} |`,
    );
  }
  console.log('');
  console.log(
    'Native TFLite / BlazeFace timings: physical Android + `ml/PROGRESS_SANYAM.md`; RN bridge reports `inferenceMs` per tap.',
  );
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
