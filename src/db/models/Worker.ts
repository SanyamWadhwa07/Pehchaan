import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Cached worker row from site package / sync. `embedding_encrypted_base64` holds ciphertext for offline recognition — never log. */
export class Worker extends Model {
  static table = 'workers';

  @field('name') name!: string;
  @field('role') role!: string;
  @field('site_id') siteId!: string;
  @field('language_preference') languagePreference!: string;
  @field('enrolled_at') enrolledAt!: number;
  @field('revoked_at') revokedAt!: string | null;
  @field('reference_thumbnail_url') referenceThumbnailUrl!: string | null;
  @field('is_revoked') isRevoked!: boolean;
  /** Encrypted embedding (base64) from site package inner payload — never log. */
  @field('embedding_encrypted_base64') embeddingEncryptedBase64!: string | null;
}
