import { supabase } from '@/lib/supabase';

/** Must match Supabase Storage bucket id + migration `003`. */
export const SITE_PACKAGES_BUCKET = 'site-packages';

/** RLS expects object keys `{siteId}/{fileName}`. */
export function sitePackageObjectPath(siteId: string, fileName: string): string {
  const safeName = fileName.replace(/^\/+/, '').replace(/\.\./g, '');
  return `${siteId}/${safeName}`;
}

export async function downloadSitePackageObject(
  siteId: string,
  fileName: string,
): Promise<ArrayBuffer> {
  const path = sitePackageObjectPath(siteId, fileName);
  const { data, error } = await supabase.storage
    .from(SITE_PACKAGES_BUCKET)
    .download(path);

  if (error) {
    throw error;
  }
  // RN TypeScript `Blob` typings may omit `arrayBuffer`; `Response` path is consistent.
  return await new Response(data).arrayBuffer();
}

export async function createSignedSitePackageUrl(
  siteId: string,
  fileName: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const path = sitePackageObjectPath(siteId, fileName);
  const { data, error } = await supabase.storage
    .from(SITE_PACKAGES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    throw error;
  }
  if (!data?.signedUrl) {
    throw new Error('No signed URL returned');
  }
  return data.signedUrl;
}

/** Supervisor/admin upload — path must match RLS site prefix. */
export async function uploadSitePackageObject(
  siteId: string,
  fileName: string,
  body: ArrayBuffer | Blob | File,
  options?: { contentType?: string; upsert?: boolean },
): Promise<void> {
  const path = sitePackageObjectPath(siteId, fileName);
  const { error } = await supabase.storage.from(SITE_PACKAGES_BUCKET).upload(path, body, {
    contentType: options?.contentType ?? 'application/zip',
    upsert: options?.upsert ?? false,
  });

  if (error) {
    throw error;
  }
}
