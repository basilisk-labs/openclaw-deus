-- Migration 019: Sensorimotor predictor — learned dynamics model
-- Predicts position_{t+1} from (position_t, action) in embedding space
-- Active Inference: minimize variational free energy

-- Learned weights for the predictor (serialized as JSON strings)
DEFINE TABLE sensorimotor_weights SCHEMAFULL;
DEFINE FIELD W_action ON sensorimotor_weights TYPE string;
DEFINE FIELD W_delta ON sensorimotor_weights TYPE string;
DEFINE FIELD W_uncertainty ON sensorimotor_weights TYPE string;
DEFINE FIELD action_index ON sensorimotor_weights TYPE string;
DEFINE FIELD learning_rate ON sensorimotor_weights TYPE float DEFAULT 0.01;
DEFINE FIELD step_count ON sensorimotor_weights TYPE int DEFAULT 0;

-- Transition buffer for experience replay (sensorimotor contingencies)
DEFINE TABLE sensorimotor_transition SCHEMAFULL;
DEFINE FIELD position_t ON sensorimotor_transition TYPE array<float>;
DEFINE FIELD position_t1 ON sensorimotor_transition TYPE array<float>;
DEFINE FIELD action ON sensorimotor_transition TYPE string;
DEFINE FIELD reward ON sensorimotor_transition TYPE float DEFAULT 0;
DEFINE FIELD cycle ON sensorimotor_transition TYPE int;
DEFINE FIELD trained ON sensorimotor_transition TYPE bool DEFAULT false;
