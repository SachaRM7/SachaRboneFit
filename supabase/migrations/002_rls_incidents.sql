-- Enable RLS for session_incidents
ALTER TABLE session_incidents ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read/write their own incidents (via session_logs.user_id)
CREATE POLICY "Users can manage their own session incidents"
ON session_incidents
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM session_logs
    WHERE session_logs.id = session_incidents.session_log_id
    AND session_logs.user_id = auth.uid()
  )
);

-- Enable RLS for precalc_sessions
ALTER TABLE precalc_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own precalc sessions"
ON precalc_sessions
FOR ALL
USING (user_id = auth.uid());

-- Enable RLS for weekly_debriefs
ALTER TABLE weekly_debriefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own weekly debriefs"
ON weekly_debriefs
FOR ALL
USING (user_id = auth.uid());