-- DEUS v4.0: BDI Cognitive Architecture

-- ═══════════════════════════════════════════
-- KNOWLEDGE (replaces belief for cognitive use)
-- ═══════════════════════════════════════════
DEFINE TABLE knowledge SCHEMAFULL;
DEFINE FIELD knowledge_id ON knowledge TYPE string;
DEFINE FIELD kind ON knowledge TYPE string
  ASSERT $value IN ['fact', 'inference', 'axiom', 'procedural', 'meta'];
DEFINE FIELD content ON knowledge TYPE string;
DEFINE FIELD domain ON knowledge TYPE string;
DEFINE FIELD confidence ON knowledge TYPE object;
DEFINE FIELD evidence ON knowledge TYPE array<object>;
DEFINE FIELD validity ON knowledge TYPE object;
DEFINE FIELD status ON knowledge TYPE string
  ASSERT $value IN ['active', 'uncertain', 'superseded', 'deprecated'];
DEFINE FIELD superseded_by ON knowledge TYPE option<string>;
DEFINE FIELD embedding ON knowledge TYPE option<array<float>>;
DEFINE FIELD last_reinforcement ON knowledge TYPE option<datetime>;
DEFINE FIELD created_at ON knowledge TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON knowledge TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_knowledge_id ON knowledge FIELDS knowledge_id UNIQUE;
DEFINE INDEX idx_knowledge_kind ON knowledge FIELDS kind;
DEFINE INDEX idx_knowledge_domain ON knowledge FIELDS domain;
DEFINE INDEX idx_knowledge_status ON knowledge FIELDS status;

-- ═══════════════════════════════════════════
-- KNOWLEDGE GAPS
-- ═══════════════════════════════════════════
DEFINE TABLE knowledge_gap SCHEMAFULL;
DEFINE FIELD description ON knowledge_gap TYPE string;
DEFINE FIELD domain ON knowledge_gap TYPE string;
DEFINE FIELD impact ON knowledge_gap TYPE float;
DEFINE FIELD resolution_strategy ON knowledge_gap TYPE string;
DEFINE FIELD blocks_intentions ON knowledge_gap TYPE array<string>;
DEFINE FIELD status ON knowledge_gap TYPE string
  ASSERT $value IN ['open', 'resolved', 'irrelevant'];
DEFINE FIELD resolved_by ON knowledge_gap TYPE option<string>;
DEFINE FIELD discovered_at ON knowledge_gap TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_gap_status ON knowledge_gap FIELDS status;

-- ═══════════════════════════════════════════
-- INTENTIONS
-- ═══════════════════════════════════════════
DEFINE TABLE intention SCHEMAFULL;
DEFINE FIELD intention_id ON intention TYPE string;
DEFINE FIELD description ON intention TYPE string;
DEFINE FIELD kind ON intention TYPE string
  ASSERT $value IN ['goal', 'task', 'sub_task', 'standing_order'];
DEFINE FIELD source ON intention TYPE string
  ASSERT $value IN ['operator_explicit', 'operator_inferred', 'agent_derived', 'system'];
DEFINE FIELD status ON intention TYPE string
  ASSERT $value IN ['recognized', 'adopted', 'active', 'suspended', 'completed', 'failed', 'abandoned'];
DEFINE FIELD parent_id ON intention TYPE option<string>;
DEFINE FIELD children_ids ON intention TYPE array<string>;
DEFINE FIELD success_criteria ON intention TYPE string;
DEFINE FIELD progress ON intention TYPE object;
DEFINE FIELD recognized_at ON intention TYPE datetime;
DEFINE FIELD adopted_at ON intention TYPE option<datetime>;
DEFINE FIELD completed_at ON intention TYPE option<datetime>;
DEFINE FIELD abandoned_reason ON intention TYPE option<string>;
DEFINE FIELD relevant_knowledge_ids ON intention TYPE array<string>;
DEFINE FIELD priority ON intention TYPE float;
DEFINE FIELD deadline ON intention TYPE option<datetime>;
DEFINE FIELD created_at ON intention TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON intention TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_intention_id ON intention FIELDS intention_id UNIQUE;
DEFINE INDEX idx_intention_status ON intention FIELDS status;
DEFINE INDEX idx_intention_parent ON intention FIELDS parent_id;

-- ═══════════════════════════════════════════
-- INTENTION TRANSITIONS (audit log)
-- ═══════════════════════════════════════════
DEFINE TABLE intention_transition SCHEMAFULL;
DEFINE FIELD intention_id ON intention_transition TYPE string;
DEFINE FIELD from_status ON intention_transition TYPE string;
DEFINE FIELD to_status ON intention_transition TYPE string;
DEFINE FIELD reason ON intention_transition TYPE string;
DEFINE FIELD triggered_by ON intention_transition TYPE string;
DEFINE FIELD timestamp ON intention_transition TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_transition_intention ON intention_transition FIELDS intention_id;

-- ═══════════════════════════════════════════
-- DELIBERATION
-- ═══════════════════════════════════════════
DEFINE TABLE deliberation SCHEMAFULL;
DEFINE FIELD intention_id ON deliberation TYPE string;
DEFINE FIELD trigger ON deliberation TYPE string;
DEFINE FIELD options ON deliberation TYPE array<object>;
DEFINE FIELD selected_option ON deliberation TYPE option<int>;
DEFINE FIELD reasoning ON deliberation TYPE string;
DEFINE FIELD commitment_level ON deliberation TYPE string;
DEFINE FIELD safety_check ON deliberation TYPE option<object>;
DEFINE FIELD outcome ON deliberation TYPE string DEFAULT 'pending';
DEFINE FIELD outcome_notes ON deliberation TYPE option<string>;
DEFINE FIELD created_at ON deliberation TYPE datetime DEFAULT time::now();
DEFINE FIELD resolved_at ON deliberation TYPE option<datetime>;
DEFINE INDEX idx_deliberation_intention ON deliberation FIELDS intention_id;

-- ═══════════════════════════════════════════
-- OPERATOR MODEL (singleton-ish, updated in place)
-- ═══════════════════════════════════════════
DEFINE TABLE operator_model SCHEMAFULL;
DEFINE FIELD expertise ON operator_model TYPE array<object>;
DEFINE FIELD communication ON operator_model TYPE object;
DEFINE FIELD session ON operator_model TYPE object;
DEFINE FIELD patterns ON operator_model TYPE object;
DEFINE FIELD trust ON operator_model TYPE object;
DEFINE FIELD updated_at ON operator_model TYPE datetime DEFAULT time::now();

-- ═══════════════════════════════════════════
-- EPISODES
-- ═══════════════════════════════════════════
DEFINE TABLE episode SCHEMAFULL;
DEFINE FIELD episode_id ON episode TYPE string;
DEFINE FIELD kind ON episode TYPE string
  ASSERT $value IN ['task_execution', 'conversation', 'error_recovery', 'learning_moment'];
DEFINE FIELD summary ON episode TYPE string;
DEFINE FIELD intention_id ON episode TYPE option<string>;
DEFINE FIELD outcome ON episode TYPE string
  ASSERT $value IN ['success', 'partial_success', 'failure', 'abandoned', 'ongoing'];
DEFINE FIELD outcome_detail ON episode TYPE option<string>;
DEFINE FIELD lessons ON episode TYPE array<object>;
DEFINE FIELD duration_ms ON episode TYPE option<int>;
DEFINE FIELD operator_satisfaction ON episode TYPE option<float>;
DEFINE FIELD relevant_knowledge_ids ON episode TYPE array<string>;
DEFINE FIELD created_at ON episode TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON episode TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_episode_id ON episode FIELDS episode_id UNIQUE;
DEFINE INDEX idx_episode_intention ON episode FIELDS intention_id;
DEFINE INDEX idx_episode_outcome ON episode FIELDS outcome;

-- ═══════════════════════════════════════════
-- PROCEDURES (extracted reusable knowledge)
-- ═══════════════════════════════════════════
DEFINE TABLE procedure SCHEMAFULL;
DEFINE FIELD procedure_id ON procedure TYPE string;
DEFINE FIELD description ON procedure TYPE string;
DEFINE FIELD steps ON procedure TYPE array<string>;
DEFINE FIELD when_to_use ON procedure TYPE string;
DEFINE FIELD when_not_to_use ON procedure TYPE string;
DEFINE FIELD success_rate ON procedure TYPE float;
DEFINE FIELD episode_ids ON procedure TYPE array<string>;
DEFINE FIELD last_used ON procedure TYPE option<datetime>;
DEFINE FIELD created_at ON procedure TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON procedure TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_procedure_id ON procedure FIELDS procedure_id UNIQUE;

-- ═══════════════════════════════════════════
-- SELF-ASSESSMENT
-- ═══════════════════════════════════════════
DEFINE TABLE self_assessment SCHEMAFULL;
DEFINE FIELD domain ON self_assessment TYPE string;
DEFINE FIELD skill_level ON self_assessment TYPE float;
DEFINE FIELD basis ON self_assessment TYPE string;
DEFINE FIELD common_mistakes ON self_assessment TYPE array<string>;
DEFINE FIELD improvement_trend ON self_assessment TYPE string;
DEFINE FIELD episode_ids ON self_assessment TYPE array<string>;
DEFINE FIELD updated_at ON self_assessment TYPE datetime DEFAULT time::now();
DEFINE INDEX idx_assessment_domain ON self_assessment FIELDS domain UNIQUE;

-- ═══════════════════════════════════════════
-- GRAPH RELATIONS
-- ═══════════════════════════════════════════
DEFINE TABLE requires TYPE RELATION FROM intention TO knowledge;
DEFINE TABLE blocked_by TYPE RELATION FROM intention TO knowledge_gap;
DEFINE TABLE derived_from_episode TYPE RELATION FROM knowledge TO episode;
DEFINE TABLE serves TYPE RELATION FROM episode TO intention;

-- Migration tracking
CREATE migration_history SET version = '006', applied_at = time::now();
