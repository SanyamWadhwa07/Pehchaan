# Central enrollment (`src/screens/enrollment/`)

**Owner: Maulik (Day 1)** — admin-led worker onboarding inside the RN app.

## Flow

1. **WorkerDetails** — name, role, hashed ID, contact, language
2. **MultiAngleCapture** — frontal, left/right 30°, up tilt; optional helmet/glasses (skippable)
3. **ReferenceThumbnail** — confirms frontal capture for supervisor confirmation UI (Day 2)
4. **EnrollmentReview** — summary → `POST /register-worker` (stub if `SUPABASE_URL` unset)

## Entry

In development builds, open **Admin enrollment** from the quality-check screen (top bar). Remove or gate before production demo.

## Day 2+

Field supervisor registration lives in `src/screens/registration/` (Aahil). Supervisor confirmation in `src/screens/supervisor/` (Maulik).
