import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Match, Team, TournamentSettings, OfficialGroupStanding } from '../lib/supabase';
import { getCached, setCached, CACHE_KEYS } from '../lib/cache';
import { Shield, Lock, AlertCircle, CheckCircle, Loader2, RefreshCw, Clock, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function Admin() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<TournamentSettings | null>(null);
  const [officialStandings, setOfficialStandings] = useState<OfficialGroupStanding[]>([]);
  const [officialBestThird, setOfficialBestThird] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [editingMatch, setEditingMatch] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dataFetched = useRef(false);

  useEffect(() => {
    if (profile && !profile.is_admin) {
      navigate('/dashboard');
      return;
    }
    if (!dataFetched.current) {
      dataFetched.current = true;
      fetchData();
    }
  }, [profile, navigate]);

  const fetchData = async () => {
    setLoading(true);

    const cachedTeams = getCached<Team[]>(CACHE_KEYS.TEAMS);
    const cachedSettings = getCached<TournamentSettings>(CACHE_KEYS.TOURNAMENT_SETTINGS);

    if (cachedTeams) setTeams(cachedTeams);
    if (cachedSettings) setSettings(cachedSettings);

    const [matchRes, teamRes, settingsRes, officialRes, bestThirdRes] = await Promise.all([
      supabase.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)').order('match_number'),
      cachedTeams ? Promise.resolve({ data: cachedTeams }) : supabase.from('teams').select
