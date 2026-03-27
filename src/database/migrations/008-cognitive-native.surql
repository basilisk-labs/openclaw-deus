-- DEUS v4.3: Push cognitive logic INTO the database (SurrealDB 3.0 compatible)

-- ═══════════════════════════════════════════
-- VECTOR INDEXES (HNSW for KNN search — replaces MTREE in SurrealDB 3.0)
-- ═══════════════════════════════════════════
DEFINE INDEX idx_belief_emb_vec ON belief_embedding FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;
DEFINE INDEX idx_knowledge_emb_vec ON knowledge FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;
DEFINE INDEX idx_activity_emb_vec ON activity_log FIELDS embedding HNSW DIMENSION 1536 DIST COSINE;

-- ═══════════════════════════════════════════
-- KNOWLEDGE COMPUTED FIELDS
-- ═══════════════════════════════════════════
DEFINE FIELD days_since_update ON knowledge VALUE
  ((time::millis(time::now()) - time::millis(updated_at)) / 86400000);
DEFINE FIELD is_stale ON knowledge VALUE
  ((time::millis(time::now()) - time::millis(updated_at)) / 86400000) > 14;

-- ═══════════════════════════════════════════
-- FULL-TEXT SEARCH ANALYZERS
-- ═══════════════════════════════════════════
DEFINE ANALYZER knowledge_content TOKENIZERS blank, class FILTERS lowercase, snowball(russian), snowball(english);
-- NOTE: SEARCH indexes not supported in SurrealDB 3.0, using string search in app code

-- ═══════════════════════════════════════════
-- CUSTOM FUNCTIONS (SurrealDB 3.0 compatible)
-- ═══════════════════════════════════════════

-- Compute cognitive coherence entirely in-DB
DEFINE FUNCTION fn::cognitive_coherence($low_threshold: float, $w_avg: float, $w_low: float, $c_penalty: float) {
  LET $active = (SELECT confidence FROM belief WHERE status = 'active');
  LET $total = array::len($active);
  IF $total = 0 {
    RETURN 0.5;
  };
  LET $avg_conf = math::mean($active.confidence);
  LET $low_count = array::len((SELECT VALUE confidence FROM belief WHERE status = 'active' AND confidence < $low_threshold));
  LET $low_ratio = $low_count / $total;
  LET $contradictions = (SELECT count() AS c FROM contradicts GROUP ALL)[0].c OR 0;
  LET $score = $avg_conf * $w_avg + (1.0 - $low_ratio) * $w_low - $contradictions * $c_penalty;
  RETURN math::clamp($score, 0.0, 1.0);
};

-- Knowledge coverage for a domain
DEFINE FUNCTION fn::knowledge_coverage($domain: string) {
  LET $total = (SELECT count() AS c FROM knowledge WHERE domain = $domain GROUP ALL)[0].c OR 0;
  LET $active = (SELECT count() AS c FROM knowledge WHERE domain = $domain AND status = 'active' GROUP ALL)[0].c OR 0;
  LET $gaps = (SELECT count() AS c FROM knowledge_gap WHERE domain = $domain AND status = 'open' GROUP ALL)[0].c OR 0;
  LET $sum = $total + $gaps;
  RETURN {
    total: $total,
    active: $active,
    gaps: $gaps,
    coverage: IF $sum > 0 THEN $active / $sum ELSE 0.0 END
  };
};

-- Intention health assessment
DEFINE FUNCTION fn::intention_health($iid: string) {
  LET $intention = (SELECT * FROM intention WHERE intention_id = $iid LIMIT 1)[0];
  LET $children = (SELECT status FROM intention WHERE parent_id = $iid);
  LET $gaps = (SELECT * FROM knowledge_gap WHERE $iid IN blocks_intentions AND status = 'open');
  LET $episodes = (SELECT outcome FROM episode WHERE intention_id = $iid);
  LET $success_count = array::len((SELECT VALUE outcome FROM episode WHERE intention_id = $iid AND outcome IN ['success', 'partial_success']));
  LET $total_episodes = array::len($episodes);
  LET $completed = (SELECT VALUE status FROM intention WHERE parent_id = $iid AND status IN ['completed', 'failed', 'abandoned']);
  RETURN {
    intention: $intention,
    child_count: array::len($children),
    completed_children: array::len($completed),
    blocking_gaps: $gaps,
    episode_success_rate: IF $total_episodes > 0 THEN $success_count / $total_episodes ELSE 0.5 END,
    is_blocked: array::len($gaps) > 0
  };
};

-- ═══════════════════════════════════════════
-- DATABASE EVENTS (TRIGGERS)
-- ═══════════════════════════════════════════

-- When knowledge is created, auto-resolve matching gaps
DEFINE EVENT knowledge_gap_autoresolve ON TABLE knowledge WHEN $event = 'CREATE' THEN {
  UPDATE knowledge_gap SET
    status = 'resolved',
    resolved_by = $after.knowledge_id
  WHERE status = 'open'
    AND domain = $after.domain
    AND string::contains(string::lowercase(description), string::lowercase($after.content));
};

-- Auto-flag beliefs when confidence drops below review threshold
DEFINE EVENT belief_review_flag ON TABLE belief WHEN $event = 'UPDATE'
  AND $after.confidence < $after.review_threshold
  AND $before.confidence >= $before.review_threshold THEN {
  UPDATE $after.id SET status = 'review_needed';
};

-- ═══════════════════════════════════════════
-- RECORD LINK FIELDS (alongside string IDs)
-- ═══════════════════════════════════════════
DEFINE FIELD parent_ref ON intention TYPE option<record<intention>>;
DEFINE FIELD intention_ref ON episode TYPE option<record<intention>>;
DEFINE FIELD intention_ref ON deliberation TYPE option<record<intention>>;

-- ═══════════════════════════════════════════
-- ADDITIONAL INDEXES (no partial indexes in SurrealDB 3.0)
-- ═══════════════════════════════════════════
DEFINE INDEX idx_active_beliefs ON belief FIELDS status;
DEFINE INDEX idx_knowledge_domain_status ON knowledge FIELDS domain, status;

CREATE migration_history SET version = '008', applied_at = time::now();
