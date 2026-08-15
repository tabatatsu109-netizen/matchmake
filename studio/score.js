/* マッチメイク Studio - 採点と診断
   画面に触らない純粋な計算だけを置く。生成器と診断の両方から使う。

   考え方
   - ハードルール（物理的に成立しない配置）は減点ではなく「公開できません」で止める
   - ソフト指標は 0〜100 点。重みは開催の形（テンプレート）ごとに変える
   - しきい値は 85以上=緑 / 65以上=黄 / それ未満=赤
*/
(function(global){
'use strict';

const levelOf = s => s >= 85 ? 'ok' : s >= 65 ? 'warn' : 'error';
const toHM = m => Math.floor(m/60)+':'+String(m%60).padStart(2,'0');
const clamp = s => Math.max(0, Math.min(100, s));

/* 開催の形ごとの重み。実装していない指標は書かない（合計で割るので影響しない） */
const WEIGHTS = {
  practice: {fill:35, cat:25, mix:10, span:10, btb:15, move:0,  want:10},
  festival: {fill:30, cat:20, mix:20, span:10, btb:10, move:5,  want:10},
  camp:     {fill:30, cat:20, mix:20, span:12, btb:8,  move:5,  want:10},
  league:   {fill:0,  cat:20, mix:0,  span:20, btb:20, move:20, want:10}
};

/* ---------- 理論上限 ----------
   「希望に届かないのは主催者のせい」に見せないため、先に物理的な上限を出す。
   avail(t,cell) と allowed(a,b) は呼び出し側から渡す */
function capacity(inp){
  const {teams, cells, avail, allowed, estimate} = inp;
  const live = cells.filter(c => !c.brk);
  const wishTotal = teams.reduce((a,t) => a + t.target, 0);
  const maxMatches = Math.min(live.length, Math.floor(wishTotal/2));

  const perTeam = teams.map(t => {
    let n = 0;
    live.forEach(c => {
      if(!avail(t,c)) return;
      if(teams.some(o => o.id !== t.id && avail(o,c) && allowed(t,o))) n++;
    });
    /* 相手の希望本数にも上限があるので、実際に組んでみた最大本数（estimate）を優先する。
       これを使わないと「相手が足りないだけ」なのに主催者のせいに見えてしまう */
    const est = estimate && estimate.perTeam ? estimate.perTeam[t.id] : undefined;
    const feasible = Math.min(t.target, est !== undefined ? est : n);
    let reason = '';
    if(feasible < t.target){
      const opp = teams.filter(o => o.id !== t.id && allowed(t,o));
      const ms = inp.maxSame || 99;
      /* 同じクラブが同時に出せる試合数。スタッフ1名なら、その時間帯を分け合うことになる */
      const lim = inp.limits && inp.clubOf ? inp.limits[inp.clubOf(t)] : 0;
      const mates = (lim && inp.clubOf) ? teams.filter(o => inp.clubOf(o) === inp.clubOf(t)).length : 1;
      const byTime = [...new Set(live.filter(c => avail(t,c)).map(c => c.start))].length;
      reason =
        opp.length === 0 ? '対戦できる相手が1チームもいません'
      : n === 0 ? '出られる時間に相手がいません'
      : (lim && mates > 1 && Math.floor(byTime * lim / mates) < t.target)
        ? '出られる時間帯が' + byTime + 'コマで、同じクラブ' + mates + 'チームが同時' + lim + '試合までを分け合うため、最大' + feasible + '本です'
      : byTime < t.target ? '出られる時間帯が' + byTime + 'コマしかありません'
      : opp.length * ms < t.target
        ? '相手が' + opp.length + 'チームで、同じカードの上限が' + ms + '回なので最大' + (opp.length*ms) + '本です'
      : '相手側の本数も埋まるため、最大' + feasible + '本までです';
    }
    return {team:t, slots:n, feasible:feasible, reason:reason};
  });

  const feasibleTotal = perTeam.reduce((a,x) => a + x.feasible, 0);
  return {
    slotCount: live.length,
    wishTotal: wishTotal,
    maxMatches: maxMatches,
    feasibleTotal: feasibleTotal,
    unavoidable: wishTotal - feasibleTotal,   /* どう頑張っても届かない本数 */
    perTeam: perTeam
  };
}

/* ---------- 診断 ---------- */
function diagnose(inp){
  const {teams, courts, cells, asg, cfg, avail, allowed, travel, venueOf,
         catDiff, catOK, sameClub, orgOf, explicitOk, template, wants, clubOf, staffLimits} = inp;
  const w = WEIGHTS[template] || WEIGHTS.festival;
  const hard = [], issues = [];
  const played = {}, mine = {};
  teams.forEach(t => {played[t.id] = 0; mine[t.id] = [];});

  const matches = [];
  asg.forEach((m,idx) => {
    if(!m) return;
    matches.push({m:m, idx:idx});
    played[m.a.id]++; played[m.b.id]++;
    mine[m.a.id].push({cell:m.cell, idx:idx, opp:m.b});
    mine[m.b.id].push({cell:m.cell, idx:idx, opp:m.a});
  });

  /* --- ハードルール：1件でもあれば公開できない --- */
  matches.forEach(({m,idx}) => {
    const c = m.cell, court = courts[c.ci];
    const L = toHM(c.start) + ' ' + court.name + '：';
    const push = (t,d) => hard.push({level:'error', idx:idx, title:L+t, detail:d});

    if(m.a.id === m.b.id) push('同じチーム同士になっています', 'チームを変えてください。');
    if(sameClub(m.a,m.b) && cfg.club === 'no')
      push('同じクラブ同士の対戦（'+m.a.club+'）', '設定で「同じクラブ同士の対戦」を許可するか、相手を変えてください。');
    if(explicitOk(m.a,m.b) === false)
      push('「対戦しない」と指定した組み合わせ', m.a.name+' と '+m.b.name+' は対戦しない設定です。');
    [m.a, m.b].forEach(t => {
      if(!(t.from <= c.start && c.start <= t.to))
        push(t.name+' がKO可能時間の外', t.name+' は '+toHM(t.from)+'〜'+toHM(t.to)+' の間しか出られません。');
      if(court.catList.length && court.catList.indexOf(t.catRaw) < 0)
        push(t.name+' がこの面の対象カテゴリー外', court.name+' は '+court.catList.join('・')+' 用です。');
    });
  });

  /* スタッフが足りないのに同時刻に複数試合（H7）。クラブ単位で見る */
  const limits = staffLimits ? staffLimits(teams) : {};
  if(Object.keys(limits).length){
    const starts = [...new Set(matches.map(x => x.m.cell.start))].sort((a,b) => a-b);
    Object.keys(limits).forEach(club => {
      starts.forEach(st => {
        const hit = matches.filter(x => {
          const c = x.m.cell;
          if(!(c.start < st + 1 && st < c.end)) return false;
          return clubOf(x.m.a) === club || clubOf(x.m.b) === club;
        });
        if(hit.length > limits[club]){
          hard.push({level:'error', idx:hit[hit.length-1].idx,
            title: toHM(st)+'：'+club+' が同時に'+hit.length+'試合',
            detail:'帯同スタッフは'+limits[club]+'名の申告です。'+
              hit.map(x => x.m.a.name+' × '+x.m.b.name).join(' / ')+' のどれかを別の時間へ動かしてください。'});
        }
      });
    });
  }

  /* 同時刻の重複と、会場移動が間に合わない配置 */
  teams.forEach(t => {
    const list = mine[t.id].slice().sort((x,y) => x.cell.start - y.cell.start);
    for(let i=0;i<list.length;i++){
      for(let j=i+1;j<list.length;j++){
        const A = list[i].cell, B = list[j].cell;
        if(A.start < B.end && B.start < A.end && !t.dual){
          hard.push({level:'error', idx:list[j].idx,
            title: toHM(B.start)+'：'+t.name+' が同時刻に2試合',
            detail:'同じ時間に2か所へは出られません。どちらかを動かしてください。'});
          continue;
        }
        const va = venueOf(A), vb = venueOf(B);
        if(va === vb) continue;
        const need = travel(va, vb);
        if(need <= 0) continue;
        const gap = A.end <= B.start ? B.start - A.end : (B.end <= A.start ? A.start - B.end : -1);
        if(gap < need){
          hard.push({level:'error', idx:list[j].idx,
            title: toHM(B.start)+'：'+t.name+' が会場間の移動に間に合いません',
            detail: va+' → '+vb+' は'+need+'分かかりますが、空きが'+Math.max(0,gap)+'分しかありません。'});
        }
      }
    }
  });

  /* --- ソフト指標 --- */
  const cap = capacity({teams:teams, cells:cells, avail:avail, allowed:allowed, estimate:inp.estimate,
    maxSame:cfg.maxSame, limits:limits, clubOf:clubOf});
  const metrics = [];

  /* 1. 本数充足：どう頑張っても届かない分は減点しない */
  let avoidable = 0, shortTeams = [];
  cap.perTeam.forEach(x => {
    const miss = Math.max(0, x.feasible - played[x.team.id]);
    if(miss > 0){ avoidable += miss; shortTeams.push(x.team.name+' '+played[x.team.id]+'/'+x.team.target+'本'); }
  });
  const fill = cap.feasibleTotal ? clamp(100 - (avoidable / cap.feasibleTotal) * 220) : 100;
  metrics.push({key:'fill', label:'本数充足', score:Math.round(fill), weight:w.fill,
    summary: avoidable === 0
      ? (cap.unavoidable ? '組める分は全部埋めました' : '全チーム希望どおり')
      : 'あと'+avoidable+'本 入れられます'});
  if(shortTeams.length) issues.push({level: avoidable > 2 ? 'error':'warn',
    title:'希望本数に届いていないチーム', detail: shortTeams.join('、')});
  if(cap.unavoidable > 0) issues.push({level:'warn', title:'物理的に組めない本数が'+cap.unavoidable+'本あります',
    detail: cap.perTeam.filter(x=>x.reason).map(x=>x.team.name+'（'+x.reason+'）').join(' / ')});

  /* 2. カテゴリー適合 */
  let catBad = 0, catList = [];
  matches.forEach(({m,idx}) => {
    const ov = explicitOk(m.a,m.b);
    if(ov === true || ov === 'want' || ov === 'want2') return;
    /* 判定は生成器と同じ関数を使う。チーム別の「上の学年OK」もここで効く */
    if(!catOK(m.a,m.b,cfg.maxCat)){
      catBad++;
      catList.push({idx:idx, s:toHM(m.cell.start)+' '+m.a.name+'('+m.a.catRaw+') × '+m.b.name+'('+m.b.catRaw+')'});
    }
  });
  const cat = matches.length ? clamp(100 - (catBad / matches.length) * 300) : 100;
  metrics.push({key:'cat', label:'カテゴリー適合', score:Math.round(cat), weight:w.cat,
    summary: catBad ? '学年差が大きい対戦が'+catBad+'件' : '設定の範囲内'});
  catList.forEach(x => issues.push({level:'warn', idx:x.idx, title:'カテゴリー差が設定の範囲外', detail:x.s}));

  /* 3. 相手の多様性：A・Bやカテゴリー違いも1つのクラブとして数える */
  let repClub = 0, repList = [];
  teams.forEach(t => {
    const cnt = {};
    mine[t.id].forEach(x => {
      const o = orgOf(x.opp);
      if(o === orgOf(t)) return;
      cnt[o] = (cnt[o]||0) + 1;
    });
    const dup = Object.keys(cnt).filter(k => cnt[k] > 1);
    let excess = 0;
    dup.forEach(k => excess += cnt[k]-1);
    /* 相手クラブがそもそも少ないなら、繰り返しは避けようがない。その分は数えない */
    const orgs = {};
    teams.forEach(o => {if(o.id !== t.id && allowed(t,o) && orgOf(o) !== orgOf(t)) orgs[orgOf(o)] = 1;});
    const unavoidable = Math.max(0, mine[t.id].length - Object.keys(orgs).length);
    repClub += Math.max(0, excess - unavoidable);
    if(dup.length && excess > unavoidable) repList.push(t.name+'（'+dup.map(k => k+'と'+cnt[k]+'本').join('、')+'）');
  });
  const mix = teams.length ? clamp(100 - (repClub / teams.length) * 60) : 100;
  metrics.push({key:'mix', label:'相手の多様性', score:Math.round(mix), weight:w.mix,
    summary: repClub ? '同じクラブと2本目以降が'+repClub+'件' : '全部ちがうクラブ'});
  if(repList.length) issues.push({level:'warn', title:'同じクラブと複数回あたるチーム', detail:repList.join('、')});

  /* 4. 待ち時間：1日いること自体は欠陥ではないので、試合と試合の間の
        いちばん長い空きだけを見る。90分までは普通とみなす */
  let gapSum = 0, n4 = 0, worstGap = null;
  teams.forEach(t => {
    const ms = mine[t.id].map(x => x.cell).sort((a,b) => a.start - b.start);
    if(ms.length < 2) return;
    let mx = 0;
    for(let i=1;i<ms.length;i++) mx = Math.max(mx, ms[i].start - ms[i-1].end);
    gapSum += Math.max(0, mx - 90); n4++;
    if(!worstGap || mx > worstGap.gap) worstGap = {name:t.name, gap:mx};
  });
  const overGap = n4 ? gapSum / n4 : 0;          /* 90分を超えた分の平均（分） */
  const span = clamp(100 - (overGap / 60) * 30);  /* 1時間の超過ごとに30点 */
  metrics.push({key:'span', label:'待ち時間', score:Math.round(span), weight:w.span,
    summary: worstGap ? '最長の空き '+worstGap.name+' '+Math.floor(worstGap.gap/60)+'時間'+String(worstGap.gap%60).padStart(2,'0')+'分' : '—'});
  if(worstGap && worstGap.gap > 150) issues.push({level:'warn', title:'長く待つチームがあります',
    detail: worstGap.name+' は試合の間が'+Math.floor(worstGap.gap/60)+'時間'+(worstGap.gap%60)+'分空いています。'});

  /* 5. 連戦：連戦OKのチームは数えない。
        出られる枠が少なければ連戦は避けようがないので、その分は減点しない
        （n本を空けて並べるには 2n-1 枠必要。足りない分は必ず連戦になる） */
  const ref = Math.min.apply(null, courts.map(c => c.interval));
  const starts = [...new Set(cells.filter(c => !c.brk).map(c => c.start))].sort((a,b) => a-b);
  let btb = 0, forced = 0, btbList = [];
  teams.forEach(t => {
    if(t.burst) return;
    const ms = mine[t.id].map(x => x.cell).sort((a,b) => a.start - b.start);
    let hit = 0;
    for(let i=1;i<ms.length;i++)
      if(ms[i].start - ms[i-1].end < ref){ hit++; btbList.push(t.name+'（'+toHM(ms[i-1].start)+'→'+toHM(ms[i].start)+'）'); }
    btb += hit;
    const slots = starts.filter(s => cells.some(c => c.start === s && !c.brk && avail(t,c))).length;
    forced += Math.max(0, ms.length - Math.ceil(slots/2));
  });
  /* 実際に到達できた最小値があればそれを基準にする（机上の下限は届かないことが多い） */
  const floor = inp.estimate && inp.estimate.minBtb !== undefined
    ? Math.max(forced, inp.estimate.minBtb) : forced;
  const avoidBtb = Math.max(0, btb - floor);
  const btbScore = matches.length ? clamp(100 - (avoidBtb / matches.length) * 120) : 100;
  metrics.push({key:'btb', label:'連戦', score:Math.round(btbScore), weight:w.btb,
    summary: btb === 0 ? '連戦なし'
      : avoidBtb === 0 ? '連戦'+btb+'件（この枠数では避けられません）'
      : '連戦'+btb+'件（'+floor+'件までは減らせます）'});
  if(avoidBtb > 0) issues.push({level:'warn', title:'続けて2本入っているチーム', detail:btbList.join('、')});

  /* 6. 会場移動：移動時間は別途ハードで担保済み。ここは「動かされるチームの割合」を見る */
  let moves = 0, moveTeams = 0, moveList = [];
  teams.forEach(t => {
    const ms = mine[t.id].map(x => x.cell).sort((a,b) => a.start - b.start);
    let k = 0;
    for(let i=1;i<ms.length;i++) if(venueOf(ms[i]) !== venueOf(ms[i-1])) k++;
    if(k){ moves += k; moveTeams++; moveList.push(t.name+'（'+k+'回）'); }
  });
  const move = teams.length ? clamp(100 - (moveTeams / teams.length) * 60) : 100;
  metrics.push({key:'move', label:'会場移動', score:Math.round(move), weight:w.move,
    summary: moveTeams ? moveTeams+'チームが会場をまたぎます（計'+moves+'回）' : '移動なし'});
  if(moveList.length) issues.push({level:'warn', title:'会場をまたぐチーム', detail:moveList.join('、')});

  /* 7. 希望反映率：「必ず当てる」と指定した組が実際に組まれたか */
  const wantList = wants || [];
  if(wantList.length){
    /* 2周のリーグ戦では1組に2本必要なので、件数ではなく本数で数える */
    const done = {}, key = (x,y) => x < y ? x+'|'+y : y+'|'+x;
    matches.forEach(({m}) => {const k = key(m.a.name, m.b.name); done[k] = (done[k]||0) + 1;});
    let need = 0, got = 0;
    const miss = [];
    wantList.forEach(p => {
      const n = p[2] || 1, have = Math.min(done[key(p[0],p[1])] || 0, n);
      need += n; got += have;
      if(have < n) miss.push(p[0]+' × '+p[1] + (n > 1 ? '（あと'+(n-have)+'本）' : ''));
    });
    const rate = need ? got / need : 1;
    metrics.push({key:'want', label:'希望反映率', score:Math.round(clamp(rate*100)), weight:w.want,
      summary: need + '本中' + got + '本を反映'});
    if(miss.length) issues.push({level:'warn', title:'組めなかった希望対戦が'+miss.length+'組',
      detail: miss.join('、')+' — 空き枠から手で入れられます。'});
  }

  /* --- まとめ --- */
  const used = metrics.filter(m => m.weight > 0);
  used.forEach(m => m.level = levelOf(m.score));
  const wsum = used.reduce((a,m) => a + m.weight, 0);
  const total = wsum ? Math.round(used.reduce((a,m) => a + m.score * m.weight, 0) / wsum) : 100;
  const worst = used.slice().sort((a,b) => a.score - b.score)[0] || null;

  const order = {error:0, warn:1};
  issues.sort((a,b) => order[a.level] - order[b.level]);

  return {
    blocked: hard.length > 0,
    hard: hard,
    totalScore: total,
    level: levelOf(total),
    worst: worst,
    metrics: used,
    issues: issues,
    capacity: cap,
    matches: matches.length
  };
}

global.MMScore = {diagnose, capacity, WEIGHTS, levelOf};
})(window);
