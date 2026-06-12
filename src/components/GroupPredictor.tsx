import { useState, useEffect, useRef } from 'react';
import { supabase, Team, GroupPrediction, TournamentSettings } from '../lib/supabase';
import { getCached, setCached, CACHE_KEYS } from '../lib/cache';
import { useAuth } from '../contexts/AuthContext';
import { Lock, AlertCircle, Info, Loader2 } from 'lucide-react';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function GroupPredictor() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [predictions, setPredictions] = useState<{ [key: string]: { 1: Team | null; 2: Team | null } }>(() => {
    const initial: { [key: string]: { 1: Team | null; 2: Team | null } } = {};
    GROUPS.forEach(g => initial[g] = { 1: null, 2: null });
    return initial;
  });
  const [bestThird, setBestThird] = useState<Team[]>([]);
  const [settings, setSettings] = useState<TournamentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dataFetched = useRef(false);

  useEffect(() => {
    if (dataFetched.current) return;
    dataFetched.current = true;
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Check cache first
    const cachedTeams = getCached<Team[]>(CACHE_KEYS.TEAMS);
    const cachedSettings = getCached<TournamentSettings>(CACHE_KEYS.TOURNAMENT_SETTINGS);

    if (cachedTeams && cachedSettings) {
      setTeams(cachedTeams);
      setSettings(cachedSettings);
      setLoading(false);
      return;
    }

    const { data: teamsData } = await supabase.from('teams').select('*').order('name');
    const { data: settingsData } = await supabase.from('tournament_settings').select('*').single();

    if (teamsData) {
      setTeams(teamsData);
      setCached(CACHE_KEYS.TEAMS, teamsData);
    }
    if (settingsData) {
      setSettings(settingsData);
      setCached(CACHE_KEYS.TOURNAMENT_SETTINGS, settingsData);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (teams.length > 0 && user) fetchPredictions();
  }, [teams, user]);

  const fetchPredictions = async () => {
    if (!user) return;
    const { data: groupPreds } = await supabase.from('predictions_group').select('*').eq('user_id', user.id);
    const grouped: { [key: string]: { 1: Team | null; 2: Team | null } } = {};
    GROUPS.forEach(g => grouped[g] = { 1: null, 2: null });
    if (groupPreds) {
      groupPreds.forEach((pred: GroupPrediction) => {
        const team = teams.find(t => t.id === pred.team_id);
        if (team) grouped[pred.group_name][pred.position as 1 | 2] = team;
      });
    }
    setPredictions(grouped);
    const { data: thirdPreds } = await supabase.from('predictions_best_third').select('*').eq('user_id', user.id);
    if (thirdPreds) setBestThird(thirdPreds.map(p => teams.find(t => t.id === p.team_id)).filter(Boolean) as Team[]);
  };

  const handlePositionSelect = (groupName: string, position: 1 | 2, team: Team | null) => {
    setPredictions(prev => {
      const updated = { ...prev };
      // Ensure all groups exist
      GROUPS.forEach(g => {
        if (!updated[g]) updated[g] = { 1: null, 2: null };
      });
      if (team) {
        GROUPS.forEach(g => {
          if (updated[g]?.[1]?.id === team.id) updated[g][1] = null;
          if (updated[g]?.[2]?.id === team.id) updated[g][2] = null;
        });
        updated[groupName][position] = team;
      } else {
        updated[groupName][position] = null;
      }
      return updated;
    });
  };

  const handleBestThirdToggle = (team: Team) => {
    setBestThird(prev => prev.find(t => t.id === team.id) ? prev.filter(t => t.id !== team.id) : prev.length < 8 ? [...prev, team] : prev);
  };

  const handleSave = async () => {
    if (!user || settings?.group_stage_locked) return;
    setSaving(true);
    setMessage(null);
    try {
      await supabase.from('predictions_group').delete().eq('user_id', user.id);
      await supabase.from('predictions_best_third').delete().eq('user_id', user.id);
      const groupInserts = [];
      for (const groupName of GROUPS) {
        if (predictions[groupName]?.[1]) groupInserts.push({ user_id: user.id, group_name: groupName, position: 1, team_id: predictions[groupName][1]!.id });
        if (predictions[groupName]?.[2]) groupInserts.push({ user_id: user.id, group_name: groupName, position: 2, team_id: predictions[groupName][2]!.id });
      }
      if (groupInserts.length > 0) await supabase.from('predictions_group').insert(groupInserts);
      if (bestThird.length > 0) await supabase.from('predictions_best_third').insert(bestThird.map(t => ({ user_id: user.id, team_id: t.id })));
      setMessage({ type: 'success', text: 'Predictions saved!' });
    } catch { setMessage({ type: 'error', text: 'Failed to save' }); }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;
  if (settings?.group_stage_locked) return <div className="text-center py-12"><Lock className="w-16 h-16 text-slate-600 mx-auto mb-4" /><h2 className="text-xl font-bold text-white mb-2">Group Stage Locked</h2><p className="text-slate-400">Predictions are closed.</p></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Group Stage Predictor</h1><p className="text-slate-400 mt-1">Select 1st and 2nd place for each group</p></div>
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-amber-200 text-sm"><p className="font-medium mb-1">Scoring:</p><ul className="space-y-1"><li>+10 pts correct position</li><li>+5 pts wrong position</li><li>+15 pts best 3rd place</li></ul></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {GROUPS.map(groupName => {
          const groupTeams = teams.filter(t => t.group_name === groupName);
          const groupPreds = predictions[groupName] || { 1: null, 2: null };
          return (
            <div key={groupName} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-4">
              <h3 className="text-lg font-bold text-white mb-4">Group {groupName}</h3>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[{ pos: 1 as const, color: 'emerald' }, { pos: 2 as const, color: 'blue' }].map(({ pos, color }) => (
                  <div key={pos} className="space-y-1">
                    <span className={`text-xs font-medium text-${color}-400`}>{pos === 1 ? '1st' : '2nd'} Place</span>
                    <div className={`min-h-[60px] p-3 rounded-xl border-2 border-dashed border-${color}-500/50 bg-${color}-500/10 flex items-center justify-center`}>
                      {groupPreds[pos] ? <div className="flex items-center gap-2">{groupPreds[pos]!.flag_url && <img src={groupPreds[pos]!.flag_url!} alt={groupPreds[pos]!.name} className="w-6 h-6 rounded object-cover" />}<span className="text-white font-medium">{groupPreds[pos]!.name}</span></div> : <span className="text-slate-500 text-sm">Select below</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                {groupTeams.map(team => {
                  const isFirst = groupPreds[1]?.id === team.id;
                  const isSecond = groupPreds[2]?.id === team.id;
                  return (
                    <div key={team.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-2">{team.flag_url && <img src={team.flag_url} alt={team.name} className="w-5 h-5 rounded object-cover" />}<span className="text-slate-300 text-sm">{team.name}</span></div>
                      <div className="flex gap-1">
                        <button onClick={() => handlePositionSelect(groupName, 1, isFirst ? null : team)} className={`px-2 py-1 rounded text-xs font-medium transition-all ${isFirst ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>1st</button>
                        <button onClick={() => handlePositionSelect(groupName, 2, isSecond ? null : team)} className={`px-2 py-1 rounded text-xs font-medium transition-all ${isSecond ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>2nd</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
        <div className="mb-4"><h2 className="text-lg font-bold text-white">Best 3rd Place Teams</h2><p className="text-slate-400 text-sm mt-1">Select 8 qualifying teams</p><p className="text-emerald-400 text-sm mt-1">Selected: {bestThird.length}/8</p></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {teams.map(team => {
            const isSelected = bestThird.some(t => t.id === team.id);
            return (
              <button key={team.id} onClick={() => handleBestThirdToggle(team)} className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${isSelected ? 'border-amber-500 bg-amber-500/20' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}>
                {team.flag_url && <img src={team.flag_url} alt={team.name} className="w-5 h-5 rounded object-cover" />}
                <span className={`text-sm font-medium ${isSelected ? 'text-amber-400' : 'text-slate-300'}`}>{team.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      {message && <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}><AlertCircle className="w-5 h-5" />{message.text}</div>}
      <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50">{saving ? 'Saving...' : 'Save Predictions'}</button>
    </div>
  );
}
