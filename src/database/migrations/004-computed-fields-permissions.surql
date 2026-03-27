-- Computed fields on beliefs (virtual, recalculated on read)
DEFINE FIELD days_since_update ON belief VALUE
  ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000);

DEFINE FIELD is_stale ON belief VALUE
  ((time::millis(time::now()) - time::millis(timestamp_updated)) / 86400000) > 7;

-- effective_confidence computed in application code (math::exp not available in SurrealDB 3.0)

-- Migration tracking entry
CREATE migration_history SET version = '004', applied_at = time::now();
