import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Profile, League } from '../lib/supabase';
import { Trophy, Globe, Users, Crown, Loader2 } from 'lucide-react';

export default function Leaderboards() {
  const { user } = useAuth();
  const [view, setView] = useState<'global' | 'leagues'>('global');
  const [globalLeaders, setGlobalLeaders] = useState<Profile[]>([]);
  const [leagues, setLeagues] = useState<{ league: League; members: { profile: Profile; points: number }[] }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) fetchData(); }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('*').order('total_points', { ascending: false }).limit(100);
    setGlobalLeaders(profiles || []);
    const { data: memberData } = await supabase.from('league_members').select('league_id, leagues(*)').eq('user_id', user?.id);
    if (memberData) {
      const results = [];
      for (const m of memberData) {
        const league = m.leagues as unknown as League;
        const { data: members } = await supabase.from('league_members').select('points, profiles(id, display_name, email, total_points)').eq('league_id', league.id);
        results.push({ league, members: (members || []).map((mem: any) => ({ profile: mem.profiles, points: mem.points })).sort((a, b) => b.points - a.points) });
      }
      setLeagues(results);
    }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Leaderboards</h1><p className="text-slate-400 mt-1">See how you stack up</p></div>
      <div className="flex gap-2 p-1 bg-slate-900/50 rounded-xl">
        <button onClick={() => setView('global')} className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${view === 'global' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><Globe className="w-5 h-5" />Global</button>
        <button onClick={() => setView('leagues')} className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${view === 'leagues' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}><Users className="w-5 h-5" />My Leagues</button>
      </div>
      {view === 'global' && (
        <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl overflow-hidden">
          {globalLeaders.length === 0 ? <div className="p-12 text-center"><Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400">No players yet</p></div> : (
            <div className="divide-y divide-slate-800">
              {globalLeaders.map((player, idx) => {
                const isMe = player.id === user?.id;
                const rank = idx + 1;
                return (
                  <div key={player.id} className={`flex items-center justify-between p-4 ${isMe ? 'bg-emerald-500/10' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${rank === 1 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-900' : rank === 3 ? 'bg-gradient-to-br from-amber-600 to-amber-800 text-white' : 'bg-slate-800 text-slate-400'}`}>{rank <= 3 ? <Crown className="w-5 h-5" /> : rank}</div>
                      <div><p className={`font-medium ${isMe ? 'text-emerald-400' : 'text-white'}`}>{player.display_name || 'Anonymous'}{isMe && ' (You)'}</p><p className="text-sm text-slate-500">{player.email?.split('@')[0]}</p></div>
                    </div>
                    <div className="text-right"><p className="font-bold text-white">{player.total_points}</p><p className="text-sm text-slate-400">pts</p></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {view === 'leagues' && (
        <div className="space-y-6">
          {leagues.length === 0 ? <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center"><Users className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400 mb-4">No leagues yet</p><a href="/leagues" className="px-4 py-2 bg-emerald-500 text-white rounded-xl inline-block">Join a League</a></div> : leagues.map(({ league, members }) => (
            <div key={league.id} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-4 bg-slate-800/50 border-b border-slate-800"><div className="flex items-center gap-3"><div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center"><Trophy className="w-5 h-5 text-white" /></div><div><h3 className="font-semibold text-white">{league.name}</h3><p className="text-sm text-slate-400">{members.length} members</p></div></div></div>
              <div className="divide-y divide-slate-800">
                {members.map((m, idx) => {
                  const isMe = m.profile?.id === user?.id;
                  return <div key={m.profile?.id} className={`flex items-center justify-between p-4 ${isMe ? 'bg-emerald-500/10' : ''}`}><div className="flex items-center gap-4"><div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${idx === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-800 text-slate-400'}`}>{idx + 1}</div><p className={`font-medium ${isMe ? 'text-emerald-400' : 'text-white'}`}>{m.profile?.display_name || 'Anonymous'}{isMe && ' (You)'}</p></div><div className="text-right"><p className="font-bold text-white">{m.points}</p><p className="text-xs text-slate-400">pts</p></div></div>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
