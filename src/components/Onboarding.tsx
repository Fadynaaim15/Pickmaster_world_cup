import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Team } from '../lib/supabase';
import { Trophy, AlertTriangle, Loader2 } from 'lucide-react';

export default function Onboarding() {
  const { user, refreshProfile } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('teams').select('*').order('name');
      setTeams(data || []);
      setLoading(false);
    };
    fetchTeams();
  }, []);

  const handleSave = async () => {
    if (!selectedTeam || !user) return;
    setSaving(true);
    const name = displayName.trim() || user.email?.split('@')[0] || 'Player';
    await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      display_name: name,
      favorite_team_id: selectedTeam,
      favorite_team_locked: true,
    });
    refreshProfile();
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to PickMaster!</h1>
          <p className="text-slate-400">Pick your favorite team to get started</p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={user?.email?.split('@')[0] || 'Your name'} />
        </div>

        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-2">Select Your Favorite Team</h2>
          <p className="text-slate-400 text-sm mb-4">This choice is permanent!</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {teams.map((team) => (
              <button key={team.id} onClick={() => setSelectedTeam(team.id)}
                className={`p-4 rounded-xl border-2 transition-all ${selectedTeam === team.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'}`}>
                {team.flag_url && <img src={team.flag_url} alt={team.name} className="w-10 h-10 mx-auto mb-2 rounded object-cover" />}
                <p className={`text-sm font-medium ${selectedTeam === team.id ? 'text-emerald-400' : 'text-slate-300'}`}>{team.name}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-200 text-sm">You'll earn +3 bonus points every time your favorite team wins!</p>
        </div>

        <button onClick={handleSave} disabled={!selectedTeam || saving}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50">
          {saving ? 'Saving...' : 'Confirm & Start Playing'}
        </button>
      </div>
    </div>
  );
}
