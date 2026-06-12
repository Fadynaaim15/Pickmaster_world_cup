import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Team = {
  id: string;
  name: string;
  flag_url: string | null;
  group_name: string;
};

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  favorite_team_id: string | null;
  favorite_team_locked: boolean;
  total_points: number;
  global_rank: number | null;
  is_admin: boolean;
};

export type Match = {
  id: string;
  match_number: number;
  stage: string;
  group_name: string | null;
  team_a_id: string | null;
  team_b_id: string | null;
  kickoff_time: string;
  venue: string | null;
  result: 'A' | 'D' | 'B' | null;
  team_a_score: number | null;
  team_b_score: number | null;
  status: string;
  team_a?: Team;
  team_b?: Team;
};

export type MatchPrediction = {
  id: string;
  user_id: string;
  match_id: string;
  prediction: 'A' | 'D' | 'B';
  points_awarded: number;
  bonus_awarded: number;
};

export type GroupPrediction = {
  id: string;
  user_id: string;
  group_name: string;
  position: 1 | 2;
  team_id: string;
  team?: Team;
};

export type BestThirdPrediction = {
  id: string;
  user_id: string;
  team_id: string;
  team?: Team;
};

export type League = {
  id: string;
  name: string;
  invite_code: string;
  creator_id: string;
  created_at: string;
};

export type LeagueMember = {
  id: string;
  league_id: string;
  user_id: string;
  points: number;
  rank: number | null;
  joined_at: string;
  profile?: Profile;
};

export type TournamentSettings = {
  id: number;
  tournament_start: string;
  group_stage_locked: boolean;
  best_third_locked: boolean;
  scoring_complete: boolean;
};

export type OfficialGroupStanding = {
  id: string;
  group_name: string;
  position: number;
  team_id: string;
  team?: Team;
};
