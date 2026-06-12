import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, Match, MatchPrediction } from '../lib/supabase';
import { getCached, setCached, CACHE_KEYS } from '../lib/cache';
import { useAuth } from '../contexts/AuthContext';
import { Lock, CheckCircle, Loader2, AlertCircle, Timer } from 'lucide-react';

const LOCK_BUFFER = 15;

interface CountdownProps {
  targetTime: string;
  onExpire?: () => void;
}

function CountdownTimer({ targetTime, onExpire }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(targetTime));

  function calculateTimeLeft(target: string) {
    const diff = new Date(target).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((diff % (1000 * 60)) / 1000),
      expired: false
    };
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetTime);
      setTimeLeft(newTimeLeft);
      if (newTimeLeft.expired && onExpire) onExpire();
    }, 1000);
    return () => clearInterval(timer);
  }, [targetTime, onExpire]);

  if (timeLeft.expired) {
    return <span className="text-red-400 font-medium animate-pulse">Started</span>;
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 2;
  return (
    <div className={`flex items-center gap-1 font-mono ${isUrgent ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
      <Timer className="w-4 h-4" />
      {timeLeft.days > 0 && <span>{timeLeft.days}d</span>}
      <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
      <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
      <span className="text-xs">{String(timeLeft.seconds).padStart(2, '0')}s</span>
    </div>
  );
}

interface MatchWithPred extends Match { prediction?: MatchPrediction }

export default function MatchPredictor() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchWithPred[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const dataFetched = useRef(false);

  const fetchMatches = useCallback(async () => {
    // Check cache first for initial load
    if (!dataFetched.current) {
      const cachedMatches = getCached<Match[]>(CACHE_KEYS.MATCHES);
      if (cachedMatches) {
        setMatches(cachedMatches.map(m => ({ ...m, prediction: undefined })));
        setLoading(false);
        dataFetched.current = true;
        // Still fetch in background to get predictions
        fetchMatchesBackground();
        return;
      }
    }

    await fetchMatchesBackground();
  }, [user]);

  const fetchMatchesBackground = async () => {
    const { data: matchData } = await supabase.from('matches').select('*, team_a:teams!matches_team_a_id_fkey(*), team_b:teams!matches_team_b_id_fkey(*)').order('kickoff_time');
    if (!user || !matchData) {
      setMatches(matchData || []);
      if (matchData) setCached(CACHE_KEYS.MATCHES, matchData);
      setLoading(false);
      return;
    }
    const { data: predictions } = await supabase.from('predictions_match').select('*').eq('user_id', user.id);
    const matchesWithPreds = matchData.map(m => ({ ...m, prediction: predictions?.find(p => p.match_id === m.id) }));
    setMatches(matchesWithPreds);
    setCached(CACHE_KEYS.MATCHES, matchData);
    setLoading(false);
    dataFetched.current = true;
  };

  useEffect(() => {
    fetchMatches();
    const i = setInterval(fetchMatches, 60000); // Reduced frequency
    return () => clearInterval(i);
  }, [fetchMatches]);

  const isLocked = (kickoff: string) => Date.now() > new Date(kickoff).getTime() - LOCK_BUFFER * 60 * 1000;

  const handlePredict = async (matchId: string, prediction: 'A' | 'D' | 'B') => {
    if (!user) return;
    const match = matches.find(m => m.id === matchId);
    if (!match || isLocked(match.kickoff_time)) { setMessage({ type: 'error', text: 'Locked' }); return; }
    setSavingId(matchId);
    setMessage(null);
    if (match.prediction?.id) {
      await supabase.from('predictions_match').update({ prediction }).eq('id', match.prediction.id);
    } else {
      await supabase.from('predictions_match').insert({ user_id: user.id, match_id: matchId, prediction });
    }
    await fetchMatches();
    setSavingId(null);
    setMessage({ type: 'success', text: 'Saved!' });
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>;

  const completed = matches.filter(m => m.status === 'completed');
  const upcoming = matches.filter(m => m.status !== 'completed' && !isLocked(m.kickoff_time));
  const locked = matches.filter(m => m.status !== 'completed' && isLocked(m.kickoff_time));

  const groupByDate = (m: MatchWithPred[]) => {
    const map = new Map<string, MatchWithPred[]>();
    m.forEach(match => {
      const date = new Date(match.kickoff_time).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'Africa/Cairo'
      });
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(match);
    });
    return Array.from(map.entries());
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
      weekday: 'long',
      timeZone: 'Africa/Cairo'
    });
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Match Predictor</h1><p className="text-slate-400 mt-1">+5 pts per correct result</p></div>
      {message && <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border border-red-500/30 text-red-200'}`}><AlertCircle className="w-5 h-5" />{message.text}</div>}
      {locked.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />Starting Soon (Locked)</h2>
          <div className="space-y-3">
            {locked.map(match => {
              const egyptTime = formatEgyptTime(match.kickoff_time);
              const dayName = getEgyptDayName(match.kickoff_time);
              return (
              <div key={match.id} className="p-4 bg-slate-800/50 rounded-xl opacity-75">
                <div className="flex items-center justify-between mb-2"><span className="text-xs text-slate-400">Match {match.match_number}</span><span className="text-xs text-red-400 flex items-center gap-1"><Lock className="w-3 h-3" />Locked</span></div>
                <div className="flex items-center justify-between mb-2">{match.team_a?.flag_url && <img src={match.team_a.flag_url} alt={match.team_a.name} className="w-6 h-6 rounded object-cover" />}<span className="text-white font-medium">{match.team_a?.name}</span><span className="text-slate-500">vs</span><span className="text-white font-medium">{match.team_b?.name}</span>{match.team_b?.flag_url && <img src={match.team_b.flag_url} alt={match.team_b.name} className="w-6 h-6 rounded object-cover" />}</div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <span className="text-emerald-400">{dayName}</span>
                  <span>|</span>
                  <span className="text-white">{egyptTime}</span>
                  <span className="text-slate-500">(Egypt)</span>
                </div>
                {match.prediction && <div className="mt-2 text-emerald-400 text-sm flex items-center gap-2"><CheckCircle className="w-4 h-4" />Predicted: {match.prediction.prediction === 'A' ? match.team_a?.name : match.prediction.prediction === 'B' ? match.team_b?.name : 'Draw'}</div>}
              </div>
            );})}
          </div>
        </div>
      )}
      {groupByDate(upcoming).map(([date, ms]) => (
        <div key={date} className="space-y-3">
          <h2 className="text-lg font-semibold text-white px-1">{date}</h2>
          {ms.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()).map(match => {
            const saving = savingId === match.id;
            const pred = match.prediction?.prediction;
            const egyptTime = formatEgyptTime(match.kickoff_time);
            const dayName = getEgyptDayName(match.kickoff_time);
            return (
              <div key={match.id} className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400">Match {match.match_number} - Group {match.group_name}</span>
                  <CountdownTimer targetTime={match.kickoff_time} onExpire={fetchMatches} />
                </div>
                <div className="text-xs text-slate-500 mb-3 flex items-center gap-2">
                  <span className="text-emerald-400 font-medium">{dayName}</span>
                  <span>|</span>
                  <span className="text-white font-medium">{egyptTime}</span>
                  <span className="text-slate-500">(Egypt Time)</span>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">{match.team_a?.flag_url && <img src={match.team_a.flag_url} alt={match.team_a.name} className="w-8 h-8 rounded object-cover" />}<span className="text-white font-medium">{match.team_a?.name}</span></div>
                  <span className="text-slate-500 text-sm">vs</span>
                  <div className="flex items-center gap-2"><span className="text-white font-medium">{match.team_b?.name}</span>{match.team_b?.flag_url && <img src={match.team_b.flag_url} alt={match.team_b.name} className="w-8 h-8 rounded object-cover" />}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['A', 'D', 'B'].map((p) => (
                    <button key={p} onClick={() => handlePredict(match.id, p as 'A' | 'D' | 'B')} disabled={saving}
                      className={`py-3 rounded-xl font-medium transition-all ${pred === p ? p === 'D' ? 'bg-amber-500 text-white shadow-lg' : p === 'A' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-blue-500 text-white shadow-lg' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                      {saving && savingId === match.id ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : p === 'D' ? 'Draw' : `Win ${p === 'A' ? match.team_a?.name : match.team_b?.name}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-400 px-1">Completed</h2>
          {completed.map(match => {
            const correct = match.prediction && match.result && match.prediction.prediction === match.result;
            return (
              <div key={match.id} className={`bg-slate-900/50 backdrop-blur-sm border rounded-2xl p-4 ${correct ? 'border-emerald-500/30' : 'border-slate-800'}`}>
                <div className="flex items-center justify-between mb-2"><span className="text-xs text-slate-400">Match {match.match_number}</span><span className="text-xs text-slate-500">Result: {match.result === 'D' ? 'Draw' : match.result === 'A' ? match.team_a?.name : match.team_b?.name}</span></div>
                <div className="flex items-center justify-between"><span className="text-white">{match.team_a?.name}</span><span className="text-2xl font-bold text-white">{match.team_a_score} - {match.team_b_score}</span><span className="text-white">{match.team_b?.name}</span></div>
                {match.prediction && <div className={`mt-2 text-sm flex items-center gap-2 ${correct ? 'text-emerald-400' : 'text-red-400'}`}>{correct ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}+{match.prediction.points_awarded || 0} pts</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
