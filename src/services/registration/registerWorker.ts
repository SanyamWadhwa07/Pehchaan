import {supabaseEnv} from '@/config/env';

export type RegisterWorkerPayload = {
  name: string;
  role: string;
  site_id: string;
  aadhaar_ref_hash: string;
  language_preference: 'en' | 'hi';
};

export type RegisterWorkerResponse = {
  worker_id: string;
  status: 'registered' | 'pending_embedding';
};

function functionsBaseUrl(): string {
  const base = supabaseEnv.url.replace(/\/$/, '');
  return `${base}/functions/v1`;
}

/** POST /register-worker — live when SUPABASE_URL is set; mock otherwise. */
export async function registerWorker(
  payload: RegisterWorkerPayload,
): Promise<RegisterWorkerResponse> {
  if (!supabaseEnv.url) {
    await new Promise<void>(resolve => {
      setTimeout(() => resolve(), 500);
    });
    return {
      worker_id: '00000000-0000-4000-8000-000000000001',
      status: 'pending_embedding',
    };
  }

  const response = await fetch(`${functionsBaseUrl()}/register-worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(supabaseEnv.anonKey
        ? {Authorization: `Bearer ${supabaseEnv.anonKey}`}
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`register-worker failed: ${response.status}`);
  }

  return (await response.json()) as RegisterWorkerResponse;
}
