-- Phase 4 Step 5.2: Enable Row Level Security on all tables
-- Execute this in Supabase Dashboard > SQL Editor

-- Enable RLS on all user-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE programme_blocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE seance_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_in_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_messages ENABLE ROW LEVEL SECURITY;

-- Policies for users table (user can only see/edit their own row)
CREATE POLICY "users_select_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

-- Policies for gyms
CREATE POLICY "gyms_all_own" ON gyms FOR ALL USING (auth.uid() = user_id);

-- Policies for exercises
CREATE POLICY "exercises_all_own" ON exercises FOR ALL USING (auth.uid() = user_id);

-- Policies for exercise_instances
CREATE POLICY "exercise_instances_all_own" ON exercise_instances FOR ALL USING (auth.uid() = user_id);

-- Policies for programme_blocs
CREATE POLICY "programme_blocs_all_own" ON programme_blocs FOR ALL USING (auth.uid() = user_id);

-- Policies for seance_templates (via programme_blocs)
CREATE POLICY "seance_templates_select_own" ON seance_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM programme_blocs WHERE programme_blocs.id = seance_templates.bloc_id AND programme_blocs.user_id = auth.uid()));
CREATE POLICY "seance_templates_all_own" ON seance_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM programme_blocs WHERE programme_blocs.id = seance_templates.bloc_id AND programme_blocs.user_id = auth.uid()));

-- Policies for exercise_in_template (via seance_templates -> programme_blocs)
CREATE POLICY "exercise_in_template_select_own" ON exercise_in_template FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM seance_templates st
    JOIN programme_blocs pb ON pb.id = st.bloc_id
    WHERE st.id = exercise_in_template.seance_template_id AND pb.user_id = auth.uid()
  ));
CREATE POLICY "exercise_in_template_all_own" ON exercise_in_template FOR ALL
  USING (EXISTS (
    SELECT 1 FROM seance_templates st
    JOIN programme_blocs pb ON pb.id = st.bloc_id
    WHERE st.id = exercise_in_template.seance_template_id AND pb.user_id = auth.uid()
  ));

-- Policies for daily_states
CREATE POLICY "daily_states_all_own" ON daily_states FOR ALL USING (auth.uid() = user_id);

-- Policies for session_logs
CREATE POLICY "session_logs_all_own" ON session_logs FOR ALL USING (auth.uid() = user_id);

-- Policies for set_logs (via session_logs)
CREATE POLICY "set_logs_select_own" ON set_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM session_logs WHERE session_logs.id = set_logs.session_log_id AND session_logs.user_id = auth.uid()));
CREATE POLICY "set_logs_all_own" ON set_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM session_logs WHERE session_logs.id = set_logs.session_log_id AND session_logs.user_id = auth.uid()));

-- Policies for body_weights
CREATE POLICY "body_weights_all_own" ON body_weights FOR ALL USING (auth.uid() = user_id);

-- Policies for coach_conversations
CREATE POLICY "coach_conversations_all_own" ON coach_conversations FOR ALL USING (auth.uid() = user_id);

-- Policies for coach_messages (via coach_conversations)
CREATE POLICY "coach_messages_select_own" ON coach_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM coach_conversations WHERE coach_conversations.id = coach_messages.conversation_id AND coach_conversations.user_id = auth.uid()));
CREATE POLICY "coach_messages_all_own" ON coach_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM coach_conversations WHERE coach_conversations.id = coach_messages.conversation_id AND coach_conversations.user_id = auth.uid()));

