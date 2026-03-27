-- DEUS v7.5: Kernel procedures in SurrealDB — spreading activation, Hebbian, forgetting

-- ═══════════════════════════════════════════
-- SPREADING ACTIVATION (single DB call instead of N+1)
-- Given a source trace, activate neighbors and apply Hebbian learning
-- ═══════════════════════════════════════════

DEFINE FUNCTION fn::spread_activation($source_tid: string, $spread_factor: float, $inhibit_factor: float, $hebbian_lr: float, $hebbian_decay: float, $cycle: int) {
  LET $source = (SELECT weight FROM trace WHERE trace_id = $source_tid AND archived = false LIMIT 1)[0];
  IF $source = NONE { RETURN { activated: 0, inhibited: 0 }; };
  IF $source.weight < 0.1 { RETURN { activated: 0, inhibited: 0 }; };

  LET $src_weight = $source.weight;
  LET $activated = 0;
  LET $inhibited = 0;

  -- Activate neighbors via 'activates' edges
  FOR $edge IN (SELECT out.trace_id AS target, weight AS edge_w FROM activates WHERE in.trace_id = $source_tid) {
    LET $boost = $edge.edge_w * $spread_factor * $src_weight;
    IF $boost > 0.01 {
      UPDATE trace SET
        weight = math::min([1.0, weight + $boost]),
        last_reactivated_cycle = $cycle
      WHERE trace_id = $edge.target AND archived = false;

      -- Hebbian: strengthen edge (co-activation)
      LET $target_w = (SELECT weight FROM trace WHERE trace_id = $edge.target LIMIT 1)[0].weight OR 0;
      LET $hebb_delta = $hebbian_lr * $src_weight * $target_w;
      LET $anti_hebb = IF $target_w < 0.1 THEN -$hebbian_decay ELSE 0 END;
      UPDATE activates SET
        weight = math::clamp(weight + $hebb_delta + $anti_hebb, 0.01, 1.0),
        co_activation_count = co_activation_count + 1,
        last_co_activation = $cycle
      WHERE in.trace_id = $source_tid AND out.trace_id = $edge.target;

      LET $activated = $activated + 1;
    };
  };

  -- Inhibit neighbors via 'inhibits' edges
  FOR $edge IN (SELECT out.trace_id AS target, weight AS edge_w FROM inhibits WHERE in.trace_id = $source_tid) {
    LET $suppress = $edge.edge_w * $inhibit_factor * $src_weight;
    UPDATE trace SET
      weight = math::max([0.0, weight - $suppress]),
      suppressed = IF weight - $suppress < 0.05 THEN true ELSE suppressed END
    WHERE trace_id = $edge.target AND archived = false;

    LET $inhibited = $inhibited + 1;
  };

  RETURN { activated: $activated, inhibited: $inhibited };
};

-- ═══════════════════════════════════════════
-- FORGETTING (batch decay all traces in one query)
-- ═══════════════════════════════════════════

DEFINE FUNCTION fn::forget_traces($base_decay: float, $archive_threshold: float) {
  -- Decay freshness: emotional traces decay slower, frequently-reactivated decay slower
  UPDATE trace SET
    freshness = freshness * (1.0 - $base_decay / math::max([1.0, math::log2(1.0 + reactivation_count)]) * IF emotional_charge != 0 THEN 0.5 ELSE 1.0 END)
  WHERE archived = false AND suppressed = false;

  -- Archive traces below threshold
  LET $archived = (UPDATE trace SET archived = true
    WHERE archived = false AND weight * freshness < $archive_threshold
    RETURN BEFORE);

  RETURN { archived: array::len($archived) };
};

-- ═══════════════════════════════════════════
-- PREDICTION ERROR BACKPROPAGATION (in-DB)
-- ═══════════════════════════════════════════

DEFINE FUNCTION fn::backprop_pred_error($trace_tid: string, $error: float, $backprop_rate: float) {
  -- Find incoming edges to this trace
  FOR $edge IN (SELECT in.trace_id AS source, weight AS edge_w FROM activates WHERE out.trace_id = $trace_tid) {
    LET $delta = -$backprop_rate * $error * $edge.edge_w;
    UPDATE activates SET
      weight = math::clamp(weight + $delta, 0.01, 1.0),
      prediction_error_sum = prediction_error_sum + $error
    WHERE in.trace_id = $edge.source AND out.trace_id = $trace_tid;
  };

  FOR $edge IN (SELECT in.trace_id AS source, weight AS edge_w FROM inhibits WHERE out.trace_id = $trace_tid) {
    LET $delta = -$backprop_rate * $error * $edge.edge_w;
    UPDATE inhibits SET
      weight = math::clamp(weight + $delta, 0.01, 1.0),
      prediction_error_sum = prediction_error_sum + $error
    WHERE in.trace_id = $edge.source AND out.trace_id = $trace_tid;
  };

  RETURN { trace: $trace_tid, error: $error };
};

-- ═══════════════════════════════════════════
-- OUTCOME REINFORCEMENT (batch edge update)
-- ═══════════════════════════════════════════

DEFINE FUNCTION fn::reinforce_outcome($trace_tids: array<string>, $reward: float, $rate: float) {
  FOR $tid IN $trace_tids {
    UPDATE trace SET weight = math::clamp(weight + $reward * $rate, 0.01, 1.0) WHERE trace_id = $tid;
    UPDATE activates SET
      weight = math::clamp(weight + $reward * $rate * 0.5, 0.01, 1.0),
      outcome_reinforcement = outcome_reinforcement + $reward
    WHERE in.trace_id = $tid;
  };
  RETURN { reinforced: array::len($trace_tids), reward: $reward };
};

CREATE migration_history SET version = '013', applied_at = time::now();
