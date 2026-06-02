import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/** Field registration queue — status `pending_registration` until sync. */
export class RegistrationRequestModel extends Model {
  static table = 'registration_requests';

  @field('worker_name') workerName!: string;
  @field('role') role!: string;
  @field('aadhaar_ref_hash') aadhaarRefHash!: string | null;
  @field('site_id') siteId!: string;
  @field('status') status!: string;
  @field('review_note') reviewNote!: string | null;
  @field('created_at') createdAt!: number;
  @field('approved_at') approvedAt!: number | null;
  @field('contact_number') contactNumber!: string | null;
  /** JSON string — array of CaptureAngle from @/types */
  @field('captured_angles_json') capturedAnglesJson!: string;
  @field('submitted_by_supervisor_id') submittedBySupervisorId!: string | null;
}
