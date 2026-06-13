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

  // 🔥 الكود السحري الجديد لحساب النقط محلياً وبدون سيرفرات خارجية
  const handleCalculateScores = async () => {
    setScoring(true);
    try {
      // 1. جلب كل الماتشات المكتملة والتوقعات
      const { data: allMatches } = await supabase.from('matches').select('*').eq('status', 'completed');
      const { data: allPredictions } = await supabase.from('predictions').select('*');
      const { data: allUsers } = await supabase.from('profiles').select('id');
      const { data: allMembers } = await supabase.from('league_members').select('*');

      if (!allMatches || !allPredictions || !allUsers) {
        throw new Error("Missing data");
      }

      // خريطة لتخزين نقط كل مستخدم
      const userScores: { [userId: string]: number } = {};
      allUsers.forEach(user => { userScores[user.id] = 0; });

      // 2. حساب النقط بناءً على التوقعات والماتشات الحقيقية
      allPredictions.forEach(pred => {
        const match = allMatches.find(m => m.id === pred.match_id);
        if (!match || !match.result) return;

        if (userScores[pred.user_id] === undefined) {
          userScores[pred.user_id] = 0;
        }

        // النتيجة بالظبط (3 نقط)
        if (pred.team_a_score === match.team_a_score && pred.team_b_score === match.team_b_score) {
          userScores[pred.user_id] += 3;
        } 
        // الاتجاه صح بس الأهداف مختلفة (نقطة واحدة)
        else if (pred.predicted_result === match.result) {
          userScores[pred.user_id] += 1;
        }
      });

      // 3. تحديث جدول الـ Profiles في الداتابيز لكل يوزر
      for (const userId of Object.keys(userScores)) {
        await supabase
          .from('profiles')
          .update({ total_points: userScores[userId] })
          .eq('id', userId);
      }

      // 4. تحديث جدول الـ league_members عشان الـ Leaderboard يتظبط
      if (allMembers && allMembers.length > 0) {
        for (const member of allMembers) {
          const currentPoints = userScores[member.user_id] || 0;
          await supabase
            .from('league_members')
            .update({ points: currentPoints })
            .eq('id', member.id);
        }
      }

      setMessage({ type: 'success', text: 'Scores and Leaderboards calculated successfully!' });
      await fetchData();
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to calculate scores. Check database rules.' });
    }
    setScoring(false);
  };

  if (!profile?.is_admin) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  const formatEgyptTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Cairo'
    });
  };

  const getEgyptDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'Africa/Cairo'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3"><div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center"><Shield className="w-6 h-6 text-white" /></div><div><h1 className="text-2xl font-bold text-white">Admin Dashboard</h1><p className="text-slate-400">Manage results</p></div></div>
      {message && <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}>{message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}{message.text}</div>}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Tournament Controls</h2><div className="flex gap-4"><button onClick={handleLockGroupStage} className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 ${settings?.group_stage_locked ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500 text-white'}`}><Lock className="w-5 h-5" />{settings?.group_stage_locked ? 'Unlock' : 'Lock'} Groups</button><button onClick={handleCalculateScores} disabled={scoring} className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium flex items-center gap-2 hover:bg-blue-600 disabled:opacity-50"><RefreshCw className={`w-5 h-5 ${scoring ? 'animate-spin' : ''}`} />Calculate Scores</button></div></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Match Results & Times</h2><div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">{matches.map(m => { const a = m.team_a as Team; const b = m.team_b as Team; const isEditing = editingMatch === m.id; const egyptDate = getEgyptDate(m.kickoff_time); const egyptTime = formatEgyptTime(m.kickoff_time); return <div key={m.id} className="p-4 bg-slate-800/50 rounded-xl"><div className="flex items-center justify-between mb-2"><span className="text-sm text-slate-400">Match {m.match_number} - Group {m.group_name}</span>{m.result && <span className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">Done</span>}</div><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2">{a?.flag_url && <img src={a.flag_url} className="w-6 h-6 rounded object-cover" />}<span className="text-white font-medium">{a?.name}</span></div><span className="text-slate-500">vs</span><div className="flex items-center gap-2"><span className="text-white font-medium">{b?.name}</span>{b?.flag_url && <img src={b.flag_url} className="w-6 h-6 rounded object-cover" />}</div></div><div className="flex items-center gap-2 mb-3 text-sm"><Clock className="w-4 h-4 text-slate-400" />{isEditing ? (<><input type="datetime-local" value={editTime} onChange={e => setEditTime(e.target.value)} className="px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg text-white" /><button onClick={() => handleSaveMatchTime(m.id)} disabled={saving} className="px-3 py-1 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600">Save</button><button onClick={() => { setEditingMatch(null); setEditTime(''); }} className="px-3 py-1 bg-slate-600 text-white rounded-lg text-xs font-medium hover:bg-slate-500">Cancel</button></>) : (<><span className="text-emerald-400">{egyptDate}</span><span className="text-white">{egyptTime}</span><span className="text-slate-500">(Egypt)</span><button onClick={() => handleEditMatchTime(m.id, m.kickoff_time)} className="p-1 text-slate-400 hover:text-white"><Edit2 className="w-3 h-3" /></button></>)}</div><div className="flex gap-2">{['A', 'D', 'B'].map(r => <button key={r} onClick={() => handleMatchResult(m.id, r as 'A' | 'D' | 'B')} disabled={saving} className={`flex-1 py-2 rounded-lg text-sm font-medium ${m.result === r ? r === 'D' ? 'bg-amber-500 text-white' : r === 'A' ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{r === 'D' ? 'Draw' : r === 'A' ? `${a?.name} Win` : `${b?.name} Win`}</button>)}</div></div>; })}</div></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-4">Official Group Standings</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">{GROUPS.map(g => { const gt = teams.filter(t => t.group_name === g); const p1 = officialStandings.find(o => o.group_name === g && o.position === 1); const p2 = officialStandings.find(o => o.group_name === g && o.position === 2); return <div key={g} className="p-4 bg-slate-800/50 rounded-xl"><h3 className="text-sm font-bold text-white mb-3">Group {g}</h3><div className="space-y-3"><div><label className="text-xs text-emerald-400 mb-1 block">1st</label><select value={p1?.team_id || ''} onChange={e => handleOfficialStanding(g, 1, e.target.value || null)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"><option value="">Select</option>{gt.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div><label className="text-xs text-blue-400 mb-1 block">2nd</label><select value={p2?.team_id || ''} onChange={e => handleOfficialStanding(g, 2, e.target.value || null)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"><option value="">Select</option>{gt.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div></div></div>; })}</div></div>
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6"><h2 className="text-lg font-semibold text-white mb-2">Best 3rd Place</h2><p className="text-slate-400 text-sm mb-4">Selected: {officialBestThird.length}/8</p><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{teams.map(t => { const sel = officialBestThird.includes(t.id); return <button key={t.id} onClick={() => handleBestThirdToggle(t.id)} className={`p-3 rounded-xl border-2 flex items-center gap-2 ${sel ? 'border-amber-500 bg-amber-500/20' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}>{t.flag_url && <img src={t.flag_url} className="w-5 h-5 rounded object-cover" />}<span className={`text-sm font-medium ${sel ? 'text-amber-400' : 'text-slate-300'}`}>{t.name}</span></button>; })}</div></div>
    </div>
  );
}
