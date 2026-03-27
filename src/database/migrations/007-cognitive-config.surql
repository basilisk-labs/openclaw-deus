-- Runtime-tunable cognitive parameters
DEFINE TABLE cognitive_config SCHEMAFULL;
DEFINE FIELD key ON cognitive_config TYPE string;
DEFINE FIELD value ON cognitive_config TYPE float;
DEFINE FIELD description ON cognitive_config TYPE string;
DEFINE FIELD min_val ON cognitive_config TYPE float;
DEFINE FIELD max_val ON cognitive_config TYPE float;
DEFINE FIELD tunable ON cognitive_config TYPE bool DEFAULT true;
DEFINE FIELD last_adjusted ON cognitive_config TYPE option<datetime>;
DEFINE FIELD adjustment_reason ON cognitive_config TYPE option<string>;
DEFINE INDEX idx_config_key ON cognitive_config FIELDS key UNIQUE;

-- Config adjustment history (audit trail)
DEFINE TABLE config_adjustment_history SCHEMAFULL;
DEFINE FIELD config_key ON config_adjustment_history TYPE string;
DEFINE FIELD old_value ON config_adjustment_history TYPE float;
DEFINE FIELD new_value ON config_adjustment_history TYPE float;
DEFINE FIELD reason ON config_adjustment_history TYPE string;
DEFINE FIELD adjusted_at ON config_adjustment_history TYPE datetime DEFAULT time::now();

CREATE migration_history SET version = '007', applied_at = time::now();
