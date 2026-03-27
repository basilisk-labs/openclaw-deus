-- Graph relations between beliefs
DEFINE TABLE supports SCHEMALESS TYPE RELATION FROM belief TO belief;
DEFINE TABLE contradicts SCHEMALESS TYPE RELATION FROM belief TO belief;
DEFINE TABLE derived_from SCHEMALESS TYPE RELATION FROM belief TO daily_memory;

-- Belief event sourcing
DEFINE TABLE belief_event SCHEMAFULL;
DEFINE FIELD belief_id ON belief_event TYPE string;
DEFINE FIELD event_type ON belief_event TYPE string
  ASSERT $value IN ['created', 'updated', 'decayed', 'promoted', 'archived', 'contradiction_flagged'];
DEFINE FIELD payload ON belief_event TYPE object;
DEFINE FIELD occurred_at ON belief_event TYPE datetime;
DEFINE INDEX idx_event_belief ON belief_event FIELDS belief_id;
DEFINE INDEX idx_event_type ON belief_event FIELDS event_type;
DEFINE INDEX idx_event_time ON belief_event FIELDS occurred_at;

-- Webhook registrations
DEFINE TABLE webhook SCHEMAFULL;
DEFINE FIELD url ON webhook TYPE string;
DEFINE FIELD events ON webhook TYPE array<string>;
DEFINE FIELD secret ON webhook TYPE string;
DEFINE FIELD active ON webhook TYPE bool DEFAULT true;
DEFINE FIELD created_at ON webhook TYPE datetime;

-- Webhook delivery log
DEFINE TABLE webhook_delivery SCHEMAFULL;
DEFINE FIELD webhook_id ON webhook_delivery TYPE option<string>;
DEFINE FIELD event ON webhook_delivery TYPE string;
DEFINE FIELD payload ON webhook_delivery TYPE object;
DEFINE FIELD status ON webhook_delivery TYPE int;
DEFINE FIELD response_body ON webhook_delivery TYPE option<string>;
DEFINE FIELD delivered_at ON webhook_delivery TYPE datetime;

-- Migration tracking
DEFINE TABLE migration_history SCHEMAFULL;
DEFINE FIELD version ON migration_history TYPE string;
DEFINE FIELD applied_at ON migration_history TYPE datetime
