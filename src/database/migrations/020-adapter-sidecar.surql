-- Adapter boundary for OpenClaw-first master runtime -> cognitive-runtime sidecar

DEFINE TABLE adapter_import_cursor SCHEMAFULL;
DEFINE FIELD key        ON adapter_import_cursor TYPE string ASSERT $value != NONE;
DEFINE FIELD value      ON adapter_import_cursor TYPE object;
DEFINE FIELD updated_at ON adapter_import_cursor TYPE datetime;
DEFINE INDEX idx_adapter_cursor_key ON adapter_import_cursor FIELDS key UNIQUE;

DEFINE TABLE adapter_log_entry SCHEMAFULL;
DEFINE FIELD source_id      ON adapter_log_entry TYPE string ASSERT $value != NONE;
DEFINE FIELD batch_id       ON adapter_log_entry TYPE option<string>;
DEFINE FIELD source_runtime ON adapter_log_entry TYPE string;
DEFINE FIELD entry_type     ON adapter_log_entry TYPE string;
DEFINE FIELD timestamp      ON adapter_log_entry TYPE option<datetime>;
DEFINE FIELD payload        ON adapter_log_entry TYPE object;
DEFINE FIELD imported_at    ON adapter_log_entry TYPE datetime;
DEFINE INDEX idx_adapter_log_source_id ON adapter_log_entry FIELDS source_id UNIQUE;

DEFINE TABLE adapter_snapshot SCHEMAFULL;
DEFINE FIELD snapshot_id    ON adapter_snapshot TYPE string ASSERT $value != NONE;
DEFINE FIELD snapshot_type  ON adapter_snapshot TYPE string;
DEFINE FIELD source_runtime ON adapter_snapshot TYPE string;
DEFINE FIELD generated_at   ON adapter_snapshot TYPE datetime;
DEFINE FIELD payload        ON adapter_snapshot TYPE object;
DEFINE FIELD imported_at    ON adapter_snapshot TYPE datetime;
DEFINE INDEX idx_adapter_snapshot_id ON adapter_snapshot FIELDS snapshot_id UNIQUE;

DEFINE FIELD source_runtime    ON belief TYPE option<string>;
DEFINE FIELD source_snapshot_id ON belief TYPE option<string>;

CREATE migration_history SET version = '020', applied_at = time::now();
