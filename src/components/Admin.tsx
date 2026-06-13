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
      cachedTeams ? Promise.resolve({ data: cachedTeams }) : supabase.from('teams').select('*'),
      cachedSettings ? Promise.resolve({ data: cachedSettings }) : supabase.from('tournament_settings').select('*').single(),
      supabase.from('official_group_standings').select('*'),
      supabase.from('official_best_third').select('team_id')
    ]);

    setMatches((matchRes.data as Match[]) || []);
    if (teamRes.data && !cachedTeams) {
      setTeams(teamRes.data);
      setCached(CACHE_KEYS.TEAMS, teamRes.data);
    }
    if (settingsRes.data && !cachedSettings) {
      setSettings(settingsRes.data);
      setCached(CACHE_KEYS.TOURNAMENT_SETTINGS, settingsRes.data);
    }
    setOfficialStandings(officialRes.data || []);
    setOfficialBestThird((bestThirdRes.data || []).map((b: any) => b.team_id));

    setLoading(false);
  };

  const handleMatchResult = async (matchId: string, result: 'A' | 'D' | 'B') => {
    setSaving(true);
    await supabase.from('matches').update({ result, status: 'completed', team_a_score: result === 'A' ? 1 : result === 'B' ? 0 : 1, team_b_score: result === 'B' ? 1 : result === 'A' ? 0 : 1 }).eq('id', matchId);
    await fetchData();
    setMessage({ type: 'success', text: 'Updated' });
    setSaving(false);
  };

  const handleEditMatchTime = (matchId: string, currentTime: string) => {
    const localTime = new Date(currentTime).toISOString().slice(0, 16);
    setEditTime(localTime);
    setEditingMatch(matchId);
  };

  const handleSaveMatchTime = async (matchId: string) => {
    if (!editTime) return;
    setSaving(true);
    const utcTime = new Date(editTime + ':00Z').toISOString();
    await supabase.from('matches').update({ kickoff_time: utcTime }).eq('id', matchId);
    setEditingMatch(null);
    setEditTime('');
    await fetchData();
    setMessage({ type: 'success', text: 'Match time updated!' });
    setSaving(false);
  };

  const handleOfficialStanding = async (groupName: string, position: 1 | 2, teamId: string | null) => {
    setSaving(true);
    await supabase.from('official_group_standings').delete().eq('group_name', groupName).eq('position', position);
    if (teamId) await supabase.from('official_group_standings').insert({ group_name: groupName, position, team_id: teamId });
    await fetchData();
    setSaving(false);
  };

  const handleBestThirdToggle = async (teamId: string) => {
    setSaving(true);
    if (officialBestThird.includes(teamId)) await supabase.from('official_best_third').delete().eq('team_id', teamId);
    else if (officialBestThird.length < 8) await supabase.from('official_best_third').insert({ team_id: teamId });
    await fetchData();
    setSaving(false);
  };

  const handleLockGroupStage = async () => {
    if (!settings) return;
    await supabase.from('tournament_settings').update({ group_stage_locked: !settings.group_stage_locked }).eq('id', 1);
    await fetchData();
    setMessage({ type: 'success', text: `Group stage ${!settings.group_stage_locked ? 'locked' : 'unlocked'}` });
  };

  // 🔥 الدالة السحرية متظبطة ومحمية من أخطاء الـ TypeScript Type Checking
  const handleCalculateScores = async () => {
    setScoring(true);
    try {
      const { data: users } = await supabase.from('profiles').select('id, favorite_team_id');
      const { data: matchPreds } = await supabase.from('predictions_match').select('id, user_id, prediction, matches!inner(id, result, team_a_id, team_b_id)');
      const { data: officialSt } = await supabase.from('official_group_standings').select('*');
      const { data: groupPreds } = await supabase.from('predictions_group').select('*');
      const { data: officialBT } = await supabase.from('official_best_third').select('team_id');
      const { data: bestThirdPreds } = await supabase.from('predictions_best_third').select('*');
      const { data: allMembers } = await supabase.from('league_members').select('*');

      if (!users) throw new Error("Missing users data");

      const pointsMap: Record<string, number> = {};
      users.forEach((u: any) => { pointsMap[u.id] = 0; });

      if (matchPreds) {
        for (const pred of matchPreds as any[]) {
          const match = pred.matches;
          if (!match?.result) continue;
          
          const pointsAwarded = pred.prediction === match.result ? 5 : 0;
          let bonusAwarded = 0;
          const user = users?.find((u: any) => u.id === pred.user_id);
          if (user?.favorite_team_id && match.result !== 'D') {
            const winnerId = match.result === 'A' ? match.team_a_id : match.team_b_id;
            if (winnerId === user.favorite_team_id) bonusAwarded = 3;
          }
          
          pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + pointsAwarded + bonusAwarded;
          await supabase.from('predictions_match').update({ points_awarded: pointsAwarded, bonus_awarded: bonusAwarded }).eq('id', pred.id);
        }
      }

      if (groupPreds && officialSt && officialSt.length > 0) {
        for (const pred of groupPreds as any[]) {
          const official = officialSt.find((o: any) => o.group_name === pred.group_name && o.team_id === pred.team_id);
          let pointsAwarded = 0;
          if (official) pointsAwarded = (official as any).position === pred.position ? 10 : 5;
          
          pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + pointsAwarded;
          await supabase.from('predictions_group').update({ points_awarded: pointsAwarded }).eq('id', pred.id);
        }
      }

      const bestThirdIds = (officialBT || []).map((b: any) => b.team_id);
      if (bestThirdPreds) {
        for (const pred of bestThirdPreds as any[]) {
          const isCorrect = bestThirdIds.includes(pred.team_id);
          const pointsAwarded = isCorrect ? 15 : 0;
          
          pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + pointsAwarded;
          await supabase.from('predictions_best_third').update({ points_awarded: pointsAwarded }).eq('id', pred.id);
        }
      }

      for (const [userId, totalPoints] of Object.entries(pointsMap)) {
        await supabase.from('profiles').update({ total_points: totalPoints }).eq('id', userId);
      }

      const { data: allProfiles } = await supabase.from('profiles').select('id, total_points').order('total
