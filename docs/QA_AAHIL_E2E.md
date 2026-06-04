# Aahil E2E — same-device supervisor demo

Run on a physical Android device with `.tflite` models in `android/app/src/main/assets/` (see `ml/README.md`).

## Steps

1. Sign in as supervisor.
2. **Register New Worker** → use **Fill demo worker (dev)** or enter details → capture face → accept (embedding generated).
3. Submit queue → success message.
4. **Authenticate Worker** → quality → recognition (Logcat: real `workerId`, not stub UUID).
5. Liveness: blink when **Perform the action now** appears; Logcat `[liveness] blink frames N` with `N >= 8`.
6. Auth result → return to dashboard → **Review now** → Confirm.
7. **Language settings** on supervisor home → switch Hindi → repeat registration labels in Hindi.

## Pass criteria

- `captured_angles_json` contains `embedding_base64` after queue (WMDB).
- Recognition matches the worker registered in step 2.
- Attendance row in local DB after confirm.
