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

    const client = supabase as any;
    const [matchRes, teamRes, settingsRes, officialRes, bestThirdRes] = await Promise.all([
      client.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)').order('match_number'),
      cachedTeams ? Promise.resolve({ data: cachedTeams }) : client.from('teams').select('*'),
      cachedSettings ? Promise.resolve({ data: cachedSettings }) : client.from('tournament_settings').select('*').single(),
      client.from('official_group_standings').select('*'),
      client.from('official_best_third').select('team_id')
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
    await (supabase as any).from('matches').update({ result, status: 'completed', team_a_score: result === 'A' ? 1 : result === 'B' ? 0 : 1, team_b_score: result === 'B' ? 1 : result === 'A' ? 0 : 1 }).eq('id', matchId);
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
    await (supabase as any).from('matches').update({ kickoff_time: utcTime }).eq('id', matchId);
    setEditingMatch(null);
    setEditTime('');
    await fetchData();
    setMessage({ type: 'success', text: 'Match time updated!' });
    setSaving(false);
  };

  const handleOfficialStanding = async (groupName: string, position: 1 | 2, teamId: string | null) => {
    setSaving(true);
    const client = supabase as any;
    await client.from('official_group_standings').delete().eq('group_name', groupName).eq('position', position);
    if (teamId) await client.from('official_group_standings').insert({ group_name: groupName, position, team_id: teamId });
    await fetchData();
    setSaving(false);
  };

  const handleBestThirdToggle = async (teamId: string) => {
    setSaving(true);
    const client = supabase as any;
    if (officialBestThird.includes(teamId)) await client.from('official_best_third').delete().eq('team_id', teamId);
    else if (officialBestThird.length < 8) await client.from('official_best_third').insert({ team_id: teamId });
    await fetchData();
    setSaving(false);
  };

  const handleLockGroupStage = async () => {
    if (!settings) return;
    await (supabase as any).from('tournament_settings').update({ group_stage_locked: !settings.group_stage_locked }).eq('id', 1);
    await fetchData();
    setMessage({ type: 'success', text: `Group stage ${!settings.group_stage_locked ? 'locked' : 'unlocked'}` });
  };

  const handleCalculateScores = async () => {
    setScoring(true);
    try {
      const db = supabase as any;

      const { data: users } = await db.from('profiles').select('id, favorite_team_id');
      const { data: matchPreds } = await db.from('predictions_match').select('id, user_id, prediction, matches!inner(id, result, team_a_id, team_b_id)');
      const { data: officialSt } = await db.from('official_group_standings').select('*');
      const { data: groupPreds } = await db.from('predictions_group').select('*');
      const { data: officialBT } = await db.from('official_best_third').select('team_id');
      const { data: bestThirdPreds } = await db.from('predictions_best_third').select('*');
      const { data: allMembers } = await db.from('league_members').select('*');

      if (!users) throw new Error("Missing users data");

      const pointsMap: Record<string, number> = {};
      users.forEach((u: any) => { pointsMap[u.id] = 0; });

      // 🔍 كاشف الأخطاء: فحص توقعات الماتشات المكتملة
      if (matchPreds) {
        console.log("=== فحص توقعات المباريات ===");
        matchPreds.forEach((pred: any) => {
          const match = pred.matches;
          if (!match?.result) return;

          // تجربة مقارنة مرنة تقبل كل الأشكال المحتملة (حروف أو كلمات كاملة)
          const p = String(pred.prediction).toLowerCase().trim();
          const r = String(match.result).toLowerCase().trim();

          console.log(`يوزر: ${pred.user_id} | توقعه: ${p} | النتيجة الحقيقية: ${r}`);

          let isCorrect = false;
          if (p === r) isCorrect = true;
          if ((r === 'a' || r === 'home') && (p === 'a' || p === 'home')) isCorrect = true;
          if ((r === 'b' || r === 'away') && (p === 'b' || p === 'away')) isCorrect = true;
          if ((r === 'd' || r === 'draw') && (p === 'd' || p === 'draw')) isCorrect = true;

          if (isCorrect) {
            pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + 5;
            console.log("🎯 التوقع صح! أخذ 5 نقاط");
          }
        });
      }

      // تحديث جدول الـ Profiles
      for (const [userId, totalPoints] of Object.entries(pointsMap)) {
        await db.from('profiles').update({ total_points: totalPoints }).eq('id', userId);
      }

      // تحديث الترتيب العام
      const { data: allProfiles } = await db.from('profiles').select('id, total_points').order('total_points', { ascending: false });
      if (allProfiles) {
        for (let i = 0; i < allProfiles.length; i++) {
          await db.from('profiles').update({ global_rank: i + 1 }).eq('id', (allProfiles[i] as any).id);
        }
      }

      // تحديث الدوريات المشتركين فيها غصب عن الـ RLS
      if (allMembers && allMembers.length > 0) {
        for (const member of allMembers as any[]) {
          const currentPoints = pointsMap[member.user_id] || 0;
          await db.from('league_members').update({ points: currentPoints }).eq('id', member.id);
        }
      }

      setMessage({ type: 'success', text: 'Scores calculated! Check Console for details.' });
      await fetchData();
    } catch (error: any) {
      console.error(error);
      setMessage({ type: 'error', text: `Failed to calculate scores: ${error.message}` });
    }
    setScoring(false);
  };

  if (!profile?.is_admin) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center"><Shield className="w-6 h-6 text-white" /></div><div><h1 className="text-2xl font-bold text-white">Admin Dashboard</h1><p className="text-slate-400">Manage results</p></div></div>
      {message && <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}>{message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}{message.text}</div>}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Tournament Controls</h2><div className="flex gap-4"><button onClick={handleLockGroupStage} className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 ${settings?.group_stage_locked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500 text-white'}`}><Lock className="w-5 h-5" />{settings?.group_stage_locked ? 'Unlock' : 'Lock'} Groups</button><button onClick={handleCalculateScores} disabled={scoring} className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium flex items-center gap-2 hover:bg-blue-600 disabled:opacity-50"><RefreshCw className={`w-5 h-5 ${scoring ? 'animate-spin' : ''}`} />Calculate Scores</button></div></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Match Results & Times</h2><div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">{matches.map(m => { const a = m.team_a as Team; const b = m.team_b as Team; return <div key={m.id} className="p-4 bg-slate-800/50 rounded-xl"><div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-400">Match {m.match_number} - Group {m.group_name}</span>{m.result && <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">Done</span>}</div><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2">{a?.flag_url && <img src={a.flag_url} className="w-6 h-6 rounded object-cover" />}<span className="text-white font-medium">{a?.name}</span></div><span className="text-slate-500">vs</span><div className="flex items-center gap-2"><span className="text-white font-medium">{b?.name}</span>{b?.flag_url && <img src={b.flag_url} className="w-6 h-6 rounded object-cover" />}</div></div><div className="flex gap-2">{['A', 'D', 'B'].map(r => <button key={r} onClick={() => handleMatchResult(m.id, r as 'A' | 'D' | 'B')} disabled={saving} className={`flex-1 py-2 rounded-lg text-sm font-medium ${m.result === r ? r === 'D' ? 'bg-amber-500 text-white' : r === 'A' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{r === 'D' ? 'Draw' : r === 'A' ? `${a?.name} Win` : `${b?.name} Win`}</button>)}</div></div>; })}</div></div>
    </div>
  );
}
