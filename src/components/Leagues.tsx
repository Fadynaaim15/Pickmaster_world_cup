import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, League, Profile } from '../lib/supabase';
import { Trophy, Plus, Copy, LogIn, Check, X, Loader2, Users, Crown } from 'lucide-react';

export default function Leagues() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<{ league: League; members: { profile: Profile; points: number }[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { if (user) fetchLeagues(); }, [user]);

  const fetchLeagues = async () => {
    if (!user) return;
    setLoading(true);
    const { data: memberData } = await supabase.from('league_members').select('league_id, leagues(*)').eq('user_id', user.id);
    if (memberData) {
      const results = await Promise.all(memberData.map(async m => {
        const league = m.leagues as unknown as League;
        const { data: members } = await supabase.from('league_members').select('points, profiles(id, display_name, email, total_points)').eq('league_id', league.id);
        return { league, members: (members || []).map((mem: any) => ({ profile: mem.profiles, points: mem.points })).sort((a, b) => b.points - a.points) };
      }));
      setLeagues(results);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!user || !name.trim()) return;
    setSaving(true);
    const { data: league, error } = await supabase.from('leagues').insert({ name: name.trim(), creator_id: user.id }).select().single();
    if (error) { setMessage({ type: 'error', text: 'Failed' }); setSaving(false); return; }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: user.id });
    setName(''); setShowCreate(false);
    setMessage({ type: 'success', text: 'Created! Share the code.' });
    fetchLeagues();
    setSaving(false);
  };

  const handleJoin = async () => {
    if (!user || !code.trim()) return;
    setSaving(true);
    const { data: league } = await supabase.from('leagues').select('*').eq('invite_code', code.trim().toUpperCase()).single();
    if (!league) { setMessage({ type: 'error', text: 'Invalid code' }); setSaving(false); return; }
    const { data: existing } = await supabase.from('league_members').select('id').eq('league_id', league.id).eq('user_id', user.id).single();
    if (existing) { setMessage({ type: 'error', text: 'Already joined' }); setSaving(false); return; }
    await supabase.from('league_members').insert({ league_id: league.id, user_id: user.id });
    setCode(''); setShowJoin(false);
    setMessage({ type: 'success', text: `Joined "${league.name}"!` });
    fetchLeagues();
    setSaving(false);
  };

  const copyCode = (c: string) => { navigator.clipboard.writeText(c); setCopied(c); setTimeout(() => setCopied(null), 2000); };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Private Leagues</h1><p className="text-slate-400 mt-1">Compete with friends</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowJoin(true)} className="p-3 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"><LogIn className="w-5 h-5" /></button>
          <button onClick={() => setShowCreate(true)} className="p-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/25"><Plus className="w-5 h-5" /></button>
        </div>
      </div>
      {message && <div className={`p-4 rounded-xl ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}>{message.text}</div>}
      {showCreate && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md"><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-white">Create League</h2><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div><input value={name} onChange={e => setName(e.target.value)} placeholder="League name" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white mb-4" /><button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full py-3 bg-emerald-500 text-white rounded-xl disabled:opacity-50">{saving ? 'Creating...' : 'Create'}</button></div></div>}
      {showJoin && <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"><div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md"><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-white">Join League</h2><button onClick={() => setShowJoin(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button></div><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="Enter code" className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-center font-mono text-lg mb-4" /><button onClick={handleJoin} disabled={saving || !code.trim()} className="w-full py-3 bg-emerald-500 text-white rounded-xl disabled:opacity-50">{saving ? 'Joining...' : 'Join'}</button></div></div>}
      {leagues.length === 0 ? <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-12 text-center"><Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" /><p className="text-slate-400 mb-4">No leagues yet</p><div className="flex gap-3 justify-center"><button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-emerald-500 text-white rounded-xl">Create</button><button onClick={() => setShowJoin(true)} className="px-4 py-2 bg-slate-800 text-white rounded-xl">Join</button></div></div> : <div className="space-y-4">{leagues.map(({ league, members }) => {
        const isCreator = league.creator_id === user?.id;
        const userRank = members.findIndex(m => m.profile?.id === user?.id) + 1;
        return (
          <div key={league.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3"><div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center"><Trophy className="w-6 h-6 text-white" /></div><div><h3 className="font-semibold text-white">{league.name}</h3><div className="flex items-center gap-2 text-sm text-slate-400"><Users className="w-4 h-4" />{members.length} members{isCreator && <Crown className="w-4 h-4 text-amber-400 ml-1" />}</div></div></div>
              <div className="text-right"><p className="text-sm text-slate-400">Your Rank</p><p className="text-xl font-bold text-white">#{userRank}</p></div>
            </div>
            {isCreator && <div className="mb-4 p-3 bg-slate-800/50 rounded-xl flex items-center justify-between"><div><p className="text-xs text-slate-500">Invite Code</p><p className="text-lg font-mono text-emerald-400 tracking-wider">{league.invite_code}</p></div><button onClick={() => copyCode(league.invite_code)} className="p-2 text-slate-400 hover:text-white">{copied === league.invite_code ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}</button></div>}
            <div className="space-y-2"><h4 className="text-sm font-medium text-slate-400">Leaderboard</h4>{members.slice(0, 5).map((m, idx) => {
              const isMe = m.profile?.id === user?.id;
              return <div key={m.profile?.id} className={`flex items-center justify-between p-2 rounded-lg ${isMe ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/30'}`}><div className="flex items-center gap-3"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-300 text-slate-900' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-700 text-slate-300'}`}>{idx + 1}</span><span className={isMe ? 'text-emerald-400' : 'text-white'}>{m.profile?.display_name || 'Anonymous'}{isMe && ' (You)'}</span></div><span className="text-slate-400 text-sm">{m.points} pts</span></div>;
            })}</div>
          </div>
        );
      })}</div>}
    </div>
  );
}
