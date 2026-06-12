import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: users } = await supabase.from('profiles').select('id, favorite_team_id');
    const { data: matchPreds } = await supabase.from('predictions_match').select('id, user_id, prediction, matches!inner(id, result, team_a_id, team_b_id)');

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
        await supabase.from('predictions_match').update({ points_awarded: pointsAwarded, bonus_awarded: bonusAwarded }).eq('id', pred.id);
      }
    }

    const { data: officialStandings } = await supabase.from('official_group_standings').select('*');
    const { data: groupPreds } = await supabase.from('predictions_group').select('*');

    if (groupPreds && officialStandings && officialStandings.length > 0) {
      for (const pred of groupPreds) {
        const official = officialStandings.find((o: any) => o.group_name === pred.group_name && o.team_id === pred.team_id);
        let pointsAwarded = 0;
        if (official) pointsAwarded = (official as any).position === pred.position ? 10 : 5;
        await supabase.from('predictions_group').update({ points_awarded: pointsAwarded }).eq('id', pred.id);
      }
    }

    const { data: officialBestThird } = await supabase.from('official_best_third').select('team_id');
    const bestThirdIds = (officialBestThird || []).map((b: any) => b.team_id);
    const { data: bestThirdPreds } = await supabase.from('predictions_best_third').select('*');

    if (bestThirdPreds) {
      for (const pred of bestThirdPreds) {
        const isCorrect = bestThirdIds.includes(pred.team_id);
        await supabase.from('predictions_best_third').update({ points_awarded: isCorrect ? 15 : 0 }).eq('id', pred.id);
      }
    }

    const pointsMap: Record<string, number> = {};
    if (matchPreds) for (const pred of matchPreds as any[]) pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + (pred.points_awarded || 0) + (pred.bonus_awarded || 0);
    if (groupPreds) for (const pred of groupPreds) pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + (pred.points_awarded || 0);
    if (bestThirdPreds) for (const pred of bestThirdPreds) pointsMap[pred.user_id] = (pointsMap[pred.user_id] || 0) + (pred.points_awarded || 0);

    for (const [userId, totalPoints] of Object.entries(pointsMap)) {
      await supabase.from('profiles').update({ total_points: totalPoints }).eq('id', userId);
    }

    const { data: allProfiles } = await supabase.from('profiles').select('id, total_points').order('total_points', { ascending: false });
    if (allProfiles) for (let i = 0; i < allProfiles.length; i++) await supabase.from('profiles').update({ global_rank: i + 1 }).eq('id', (allProfiles[i] as any).id);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
