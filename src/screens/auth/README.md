# Auth flow (`src/screens/auth/`)

**Day 1 (this branch):** `QualityCheckScreen` — camera preview, face bounding box overlay, quality feedback via stub service.

**Day 2+:** Liveness challenges → recognition result → waiting for supervisor confirmation (Maulik owns confirmation UI).

All copy via `src/locales/` and `@/lib/qualityI18n` / `@/lib/livenessI18n`. ML via `@/services/faceRecognition` (stub until native bridge merges).
