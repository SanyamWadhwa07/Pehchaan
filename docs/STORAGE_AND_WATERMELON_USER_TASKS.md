# Storage + WatermelonDB — your checklist

You already created the **private** bucket **`site-packages`** in the Dashboard. Finish the items below on your machine / in Supabase.

---

## Supabase (you)

1. **Apply migration `003_storage_site_packages.sql`**

   ```bash
   cd Pehchaan
   npx supabase db push
   ```

   This registers the bucket row if missing and creates **`storage.objects`** policies. It is safe if the bucket already exists.

2. **Object path convention (important)**  
   Store files under **`{site_uuid}/{filename}`** — first path segment must equal `public.sites.id` (UUID text).  
   Example object key: `a1bd38ee-b9c7-482b-ba8f-ac8e4dec429a/site-package-v12.zip`

3. **`site_packages.storage_path`**  
   When your Edge Function writes metadata, store either the **object key** above or a path the app can resolve to that key (keep consistent with download logic in Day 2).

4. **Quick test (optional)**  
   As **supervisor** in Dashboard → Storage → upload a small zip under folder = your `sites.id`, then confirm the same user can download via signed URL / client with that JWT.

---

## React Native (you)

1. **Install native deps (already in `package.json`)**

   ```bash
   npm install
   ```

2. **Rebuild the app** (Watermelon uses **react-native-quick-sqlite** 8.0.0 — pinned for **RN 0.73**; upgrade the lib when you move to RN ≥ 0.74).

   ```bash
   npx react-native run-android
   # iOS:
   cd ios && pod install && cd ..
   npx react-native run-ios
   ```

3. **Babel** — `babel.config.js` already includes **decorators** + **class properties** for Watermelon models.

4. **Clear Metro cache** if the bundler errors after the change:

   ```bash
   npx react-native start --reset-cache
   ```

---

## Repo / agent (already done)

- Migration **`003_storage_site_packages.sql`** (bucket insert + RLS on `storage.objects`).
- **`src/db/`** — Watermelon schema (`workers`, `attendance_records`, `registration_requests`), models, `database` singleton, **`DatabaseProvider`** in `App.tsx`.
- Column **`outbox_sync_status`** on local attendance (avoids clashing with Watermelon’s `Model.syncStatus`).

---

## Next implementation (later)

- Sync adapter: map `outbox_sync_status` ↔ Postgres `sync_status`.
- Site package download → hydrate **`workers`** table with server UUID as record `id`.
- Edge function `create-site-package` uploading to **`site-packages`** using the path convention.
