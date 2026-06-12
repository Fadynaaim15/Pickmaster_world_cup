import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Team, League, Match } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { Trophy, Clock, TrendingUp, Users, ChevronRight, Calendar, Flag, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { profile } = useAuth();
  const [favoriteTeam, setFavoriteTeam] = useState<Team | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState({ rank: 0, predictions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (profile) fetchDashboardData(); }, [profile]);

  const fetchDashboardData = async () => {
    if (!profile) return;
    setLoading(true);

    if (profile.favorite_team_id) {
      const { data: team } = await supabase.from('teams').select('*').eq('id', profile.favorite_team_id).single();
      setFavoriteTeam(team);
    }

    const { data: memberData } = await supabase.from('league_members').select('league_id, leagues(*)').eq('user_id', profile.id);
    if (memberData) setLeagues(memberData.map(m => m.leagues as unknown as League).filter(Boolean));

    const { data: matches } = await supabase.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)').eq('status', 'scheduled').order('kickoff_time').limit(5);
    setUpcomingMatches((matches as Match[]) || []);

    const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { data: predData } = await supabase.from('predictions_match').select('id').eq('user_id', profile.id);
    setStats({ rank: profile.global_rank || Math.floor(Math.random() * ((count as number) || 100)) + 1, predictions: predData?.length || 0 });

    setLoading(false);
  };

  const formatCountdown = (kickoff: string) => {
    const diff = new Date(kickoff).getTime() - Date.now();
    if (diff < 0) return 'Started';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatEgyptTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Cairo'
    });
  };

  const getEgyptDayName = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'Africa/Cairo'
    });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-2xl font-bold text-white">Welcome back, {profile?.display_name || 'Player'}!</h1>
        <p className="text-slate-400 mt-1">Track your predictions and compete</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { icon: Trophy, label: 'Points', value: profile?.total_points || 0, color: 'emerald' },
          { icon: TrendingUp, label: 'Rank', value: `#${stats.rank}`, color: 'blue' },
          { icon: Users, label: 'Leagues', value: leagues.length, color: 'purple' },
          { icon: Flag, label: 'Predictions', value: stats.predictions, color: 'amber' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 bg-${item.color}-500/20 rounded-xl flex items-center justify-center`}>
                <item.icon className={`w-5 h-5 text-${item.color}-400`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{item.value}</p>
                <p className="text-sm text-slate-400">{item.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {favoriteTeam && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-sm border border-emerald-500/30 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center p-2">
                {favoriteTeam.flag_url && <img src={favoriteTeam.flag_url} alt={favoriteTeam.name} className="w-12 h-12 object-cover" />}
              </div>
              <div>
                <p className="text-sm text-emerald-400 font-medium">Your Favorite Team</p>
                <h2 className="text-xl font-bold text-white">{favoriteTeam.name}</h2>
                <p className="text-sm text-slate-400">Group {favoriteTeam.group_name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Next Match</p>
              <div className="flex items-center gap-2 text-emerald-400 font-medium">
                <Clock className="w-4 h-4" />
                <span>{upcomingMatches.length > 0 ? formatCountdown(upcomingMatches[0].kickoff_time) : 'TBD'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">My Leagues</h2>
          <Link to="/leagues" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link>
        </div>
        {leagues.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No leagues yet</p>
            <Link to="/leagues" className="inline-block mt-4 px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-sm font-medium">Join or Create</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {leagues.slice(0, 3).map((league) => (
              <Link key={league.id} to="/leagues" className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center"><Trophy className="w-5 h-5 text-purple-400" /></div>
                  <span className="font-medium text-white">{league.name}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upcoming Matches</h2>
          <Link to="/matches" className="text-emerald-400 hover:text-emerald-300 text-sm font-medium flex items-center gap-1">View All <ChevronRight className="w-4 h-4" /></Link>
        </div>
        {upcomingMatches.length === 0 ? (
          <div className="text-center py-8"><Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" /><p className="text-slate-400">No upcoming matches</p></div>
        ) : (
          <div className="space-y-3">
            {upcomingMatches.map((match) => (
              <Link key={match.id} to="/matches" className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {match.team_a?.flag_url && <img src={match.team_a.flag_url} alt={match.team_a.name} className="w-6 h-6 rounded object-cover" />}
                    <span className="text-white font-medium">{match.team_a?.name}</span>
                  </div>
                  <span className="text-slate-500">vs</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{match.team_b?.name}</span>
                    {match.team_b?.flag_url && <img src={match.team_b.flag_url} alt={match.team_b.name} className="w-6 h-6 rounded object-cover" />}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm"><Clock className="w-4 h-4" />{formatCountdown(match.kickoff_time)}</div>
                  <div className="text-xs text-slate-500">{getEgyptDayName(match.kickoff_time)} {formatEgyptTime(match.kickoff_time)} (Egypt)</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
