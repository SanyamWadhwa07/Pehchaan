# Auth flow (`src/screens/auth/`)

**Day 1:** `WelcomeScreen`, `QualityCheckScreen` — camera preview, face overlay, quality feedback (stub).

**Day 2:** `RecognitionScreen` → `LivenessChallengeScreen` → `AuthResultScreen` (waiting for supervisor).

All copy via `src/locales/` and `@/lib/qualityI18n` / `@/lib/livenessI18n`. ML via `@/services/faceRecognition` and `@/services/liveness` (stubs until native bridge merges).

## Handoff to Maulik (supervisor confirmation)

After liveness, `AuthResultScreen` writes [`pendingAuthStore`](../../stores/pendingAuthStore.ts) with `status: 'awaiting_confirmation'`.

Maulik reads `usePendingAuthStore().session` on `SupervisorConfirmationScreen`, then on Confirm writes a WatermelonDB `attendance_records` row and sets `status: 'confirmed'` or `'rejected'`.

Required fields on the session: `workerId`, `workerName`, `thumbnailBase64`, `siteId`, `deviceId`, `confidence`, `authTier`, `livenessSession`, `requiresSupervisorFlag`.
