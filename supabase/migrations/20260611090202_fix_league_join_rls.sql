-- Fix: Allow users to view leagues by invite code (needed for joining)
DROP POLICY IF EXISTS select_leagues_member ON leagues;

CREATE POLICY "select_leagues_all" ON leagues FOR SELECT
  TO authenticated USING (true);

-- Also allow members to see leagues they belong to
CREATE POLICY "select_leagues_member" ON leagues FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM league_members 
      WHERE league_members.league_id = leagues.id 
      AND league_members.user_id = auth.uid()
    ) OR creator_id = auth.uid()
  );