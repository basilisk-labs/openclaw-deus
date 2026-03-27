-- Multi-agent support: add agent_id to core tables
DEFINE FIELD agent_id ON belief TYPE string DEFAULT 'deus-primary';
DEFINE FIELD agent_id ON activity_log TYPE string DEFAULT 'deus-primary';
DEFINE FIELD agent_id ON review_candidate TYPE string DEFAULT 'deus-primary';
DEFINE FIELD agent_id ON policy_decision TYPE string DEFAULT 'deus-primary';
DEFINE FIELD agent_id ON introspection_report TYPE string DEFAULT 'deus-primary';

DEFINE INDEX idx_belief_agent ON belief FIELDS agent_id;
DEFINE INDEX idx_log_agent ON activity_log FIELDS agent_id;

-- Agent registry
DEFINE TABLE agent SCHEMAFULL;
DEFINE FIELD agent_id ON agent TYPE string;
DEFINE FIELD name ON agent TYPE string;
DEFINE FIELD description ON agent TYPE option<string>;
DEFINE FIELD status ON agent TYPE string DEFAULT 'active';
DEFINE FIELD config ON agent TYPE object DEFAULT {};
DEFINE FIELD created_at ON agent TYPE datetime;
DEFINE INDEX idx_agent_id ON agent FIELDS agent_id UNIQUE;
