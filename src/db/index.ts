import {Database} from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import {
  addColumns,
  schemaMigrations,
} from '@nozbe/watermelondb/Schema/migrations';

import {AttendanceRecordModel} from '@/db/models/AttendanceRecordModel';
import {RegistrationRequestModel} from '@/db/models/RegistrationRequestModel';
import {Worker} from '@/db/models/Worker';
import {schema} from '@/db/schema';

const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'workers',
          columns: [
            {
              name: 'embedding_encrypted_base64',
              type: 'string',
              isOptional: true,
            },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'attendance_records',
          columns: [
            {name: 'retry_count', type: 'number'},
            {name: 'last_error_at', type: 'number', isOptional: true},
          ],
        }),
        addColumns({
          table: 'registration_requests',
          columns: [
            {name: 'retry_count', type: 'number'},
            {name: 'last_error_at', type: 'number', isOptional: true},
            {name: 'server_record_id', type: 'string', isOptional: true},
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'attendance_records',
          columns: [{ name: 'client_event_id', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'pehchaan',
  jsi: true,
  onSetUpError: error => {
    console.error('[WatermelonDB] setup error', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Worker, AttendanceRecordModel, RegistrationRequestModel],
});

export {schema, SCHEMA_VERSION} from './schema';
