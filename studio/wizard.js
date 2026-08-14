/* マッチメイク Studio - セットアップの質問と自動保存
   質問するのは「全体のこと」だけ。チームは表で入れる。
   ウィザードは入口、表は編集の場。どちらも同じデータを指す。 */
'use strict';

/* ---------- 自動保存 ---------- */
const WKEY = 'mmstudio:draft';
let SAVETIMER = null;
function snapshot(){
  const o = {template:(typeof TPL !== 'undefined' ? TPL : 'festival'), cfg:{},
    venues:readVenues().map(v => v.name), travel:[],
    courts:readCourts().map(c => ({name:c.name, venue:readVenues().findIndex(v => v.id === c.venueId),
      from:c.from, to:c.to, match:c.match, interval:c.interval, cats:c.cats})),
    teams:readTeams(),
    pairs:Object.keys(PAIROV).map(k => {const p = JSON.parse(k); return [p[0],p[1],PAIROV[k]];})};
  ['cfgDate','cfgTitle','cfgNote','cfgFormat','cfgCat','cfgBack','cfgSame','cfgClub','cfgRank','cfgMix']
    .forEach(k => {if($(k)) o.cfg[k] = $(k).value;});
  const vs = readVenues();
  Object.keys(TRAVEL).forEach(k => {
    const p = k.split('|');
    const a = vs.filter(v => v.id === p[0])[0], b = vs.filter(v => v.id === p[1])[0];
    if(a && b) o.travel.push([a.name, b.name, TRAVEL[k]]);
  });
  return o;
}
function autoSave(){
  clearTimeout(SAVETIMER);
  SAVETIMER = setTimeout(() => {
    try{
      const o = snapshot();
      if(!o.teams.length && !o.cfg.cfgTitle) return;
      o.savedAt = new Date().toISOString();
      localStorage.setItem(WKEY, JSON.stringify(o));
      const e = $('saveMark');
      if(e){e.textContent = '保存しました ' + o.savedAt.slice(11,16); e.style.opacity = 1;
        setTimeout(() => {e.style.opacity = .45;}, 1500);}
    }catch(err){/* 容量超過などは黙って諦める（作業は続けられる） */}
  }, 600);
}
function applyDraft(o){
  Object.keys(o.cfg || {}).forEach(k => {if($(k)) $(k).value = o.cfg[k];});
  if(o.template) TPL = o.template;
  $('venueBody').innerHTML = '';
  ((o.venues && o.venues.length) ? o.venues : ['会場']).forEach(n => addVenue(n));
  $('courtBody').innerHTML = '';
  (o.courts || []).forEach(c => addCourt({name:c.name, venue:c.venue || 0, from:toHM2(c.from), to:toHM2(c.to),
    match:c.match, interval:c.interval, cats:c.cats || ''}));
  const vs = readVenues();
  TRAVEL = {};
  (o.travel || []).forEach(t => {
    const a = vs.filter(v => v.name === t[0])[0], b = vs.filter(v => v.name === t[1])[0];
    if(a && b) TRAVEL[tkey(a.id,b.id)] = t[2];
  });
  syncVenues();
  $('teamBody').innerHTML = '';
  (o.teams || []).forEach(t => addTeam({name:t.name, cat:t.catRaw, players:t.players, from:toHM2(t.from), to:toHM2(t.to),
    target:t.target, dual:t.dual, burst:t.burst, home:t.home, club:t.club, rank:t.rank,
    catUp:t.catUp || 0, catDown:t.catDown || 0, staffLimit:t.staffLimit || 0, note:t.note || ''}));
  PAIROV = {};
  (o.pairs || []).forEach(p => PAIROV[povk(p[0],p[1])] = (p[2] === 'want' ? 'want' : !!p[2]));
  drawTpl(); refreshHint();
}
function restoreDraft(){
  try{
    const raw = localStorage.getItem(WKEY);
    if(!raw) return false;
    const o = JSON.parse(raw);
    if(!o.teams || !o.teams.length) return false;
    applyDraft(o);
    return o.savedAt || true;
  }catch(e){return false;}
}
function clearDraft(){try{localStorage.removeItem(WKEY);}catch(e){}}

/* ---------- セットアップの質問 ---------- */
const STEPS = [
  {key:'tpl',    q:'どんな開催ですか？'},
  {key:'basic',  q:'いつ、何人制でやりますか？'},
  {key:'venue',  q:'会場はいくつありますか？'},
  {key:'court',  q:'面（コート）と時間割を教えてください'},
  {key:'rule',   q:'対戦の決まりごとはどうしますか？'}
];
let WSTEP = 0;
function openWizard(){WSTEP = 0; $('wizard').style.display = 'block'; drawWizard(); $('wizard').scrollIntoView({behavior:'smooth'});}
function closeWizard(){$('wizard').style.display = 'none'; $('wizOpen').textContent = '質問に答えて設定する';}
function wizGo(d){
  WSTEP = Math.max(0, Math.min(STEPS.length - 1, WSTEP + d));
  drawWizard();
  $('wizard').scrollIntoView({behavior:'smooth', block:'start'});
}
function wizVenueCount(n){
  const cur = venueRows().length;
  for(let i = cur; i < n; i++) addVenue('第' + (i+1) + '会場');
  for(let i = cur; i > n; i--) venueRows()[i-1].remove();
  syncVenues(); drawWizard();
}
function wizCourtCount(vi,n){
  const rows = [...$('courtBody').querySelectorAll('tr')];
  const mine = rows.filter(tr => +tr.querySelector('.c-venue').value === vi);
  const vs = readVenues();
  /* 会場ごとに A面 / B面 と振る。会場名は進行表の見出しに出るので、面の名前は短くする */
  const base = mine.length ? mine[0] : null;
  for(let i = mine.length; i < n; i++)
    addCourt({name:'ABCDEF'[i] + (vs.length > 1 ? '面' : 'コート'), venue:vi,
      from: base ? base.querySelector('.c-from').value : '09:00',
      to:   base ? base.querySelector('.c-to').value   : '16:00',
      match:base ? +base.querySelector('.c-match').value : 50,
      interval:base ? +base.querySelector('.c-int').value : 70, cats:''});
  for(let i = mine.length; i > n; i--) mine[i-1].remove();
  refreshHint(); drawWizard();
}
function wizAllCourts(field,val){
  [...$('courtBody').querySelectorAll('tr')].forEach(tr => {tr.querySelector('.' + field).value = val;});
  refreshHint(); drawWizard();
}
function drawWizard(){
  const s = STEPS[WSTEP];
  let h = '<div class="wizTop">' + STEPS.map((x,i) =>
    '<span class="wizDot' + (i === WSTEP ? ' on' : i < WSTEP ? ' done' : '') + '">' + (i+1) + '</span>').join('') +
    '<span class="wizStep">' + (WSTEP+1) + ' / ' + STEPS.length + '</span></div>';
  h += '<div class="wizQ">' + esc(s.q) + '</div>';

  if(s.key === 'tpl'){
    h += '<div class="chips">' + TEMPLATES.map(t =>
      '<button class="chip' + (t.key === TPL ? ' on' : '') + '" onclick="pickTpl(\'' + t.key + '\');drawWizard()">' +
      esc(t.name) + '</button>').join('') + '</div>' +
      '<p class="hint">' + esc((TEMPLATES.filter(t => t.key === TPL)[0] || {}).desc || '') + '</p>';
  }
  if(s.key === 'basic'){
    h += '<div class="noteRow"><label>日付</label><input type="date" value="' + $('cfgDate').value +
      '" onchange="$(\'cfgDate\').value=this.value;autoSave()" style="width:180px"></div>' +
      '<div class="noteRow"><label>大会・行事名</label><input value="' + esc($('cfgTitle').value) +
      '" oninput="$(\'cfgTitle\').value=this.value;autoSave()" style="max-width:280px"></div>' +
      '<div class="noteRow"><label>何人制</label>' +
      ['8','11'].map(v => '<button class="chip' + ($('cfgFormat').value === v ? ' on' : '') +
        '" onclick="$(\'cfgFormat\').value=\'' + v + '\';drawWizard();autoSave()">' + v + '人制</button>').join('') + '</div>';
  }
  if(s.key === 'venue'){
    const n = venueRows().length;
    h += '<div class="chips">' + [1,2,3,4,5,6].map(v =>
      '<button class="chip' + (n === v ? ' on' : '') + '" onclick="wizVenueCount(' + v + ')">' + v + 'か所</button>').join('') + '</div>';
    h += '<div class="scroll"><table class="tbl"><thead><tr><th>会場名</th></tr></thead><tbody>' +
      readVenues().map((v,i) => '<tr><td><input value="' + esc(v.name) +
        '" oninput="venueRows()[' + i + '].querySelector(\'.v-name\').value=this.value;syncVenues();autoSave()"></td></tr>').join('') +
      '</tbody></table></div>';
    if(n > 1) h += '<p class="hint">離れている会場は、下の「会場」欄で<b>移動時間</b>を入れてください。入れておくと、間に合わない組み合わせを作らなくなります。</p>';
  }
  if(s.key === 'court'){
    const vs = readVenues(), rows = [...$('courtBody').querySelectorAll('tr')];
    vs.forEach((v,vi) => {
      const n = rows.filter(tr => +tr.querySelector('.c-venue').value === vi).length;
      h += '<div class="noteRow"><label>' + esc(v.name) + '</label>' +
        [1,2,3,4].map(x => '<button class="chip' + (n === x ? ' on' : '') +
          '" onclick="wizCourtCount(' + vi + ',' + x + ')">' + x + '面</button>').join('') + '</div>';
    });
    const c0 = rows.length ? rows[0] : null;
    if(c0) h += '<div class="noteRow"><label>使用時間</label>' +
      '<span class="ni">開始 <input type="time" step="900" value="' + c0.querySelector('.c-from').value +
        '" onchange="wizAllCourts(\'c-from\',this.value);autoSave()"></span>' +
      '<span class="ni">終了 <input type="time" step="900" value="' + c0.querySelector('.c-to').value +
        '" onchange="wizAllCourts(\'c-to\',this.value);autoSave()"></span></div>' +
      '<div class="noteRow"><label>1試合の長さ</label>' +
      '<input type="number" min="5" max="120" value="' + c0.querySelector('.c-match').value +
        '" onchange="wizAllCourts(\'c-match\',this.value);autoSave()" style="width:80px">分' +
      '<label style="min-width:90px;margin-left:14px">次の開始まで</label>' +
      '<input type="number" min="5" max="180" value="' + c0.querySelector('.c-int').value +
        '" onchange="wizAllCourts(\'c-int\',this.value);autoSave()" style="width:80px">分</div>' +
      '<p class="hint">面ごとに変えたい場合は、下の「面（コート）」の表で直せます。</p>';
  }
  if(s.key === 'rule'){
    const sel = (id,label,opts) => '<div class="noteRow"><label>' + label + '</label>' +
      opts.map(o => '<button class="chip' + ($(id).value === o[0] ? ' on' : '') +
        '" onclick="$(\'' + id + '\').value=\'' + o[0] + '\';drawWizard();drawTpl();autoSave()">' + o[1] + '</button>').join('') + '</div>';
    h += sel('cfgCat','学年の差', [['0','同学年のみ'],['1','±1学年'],['2','±2学年'],['9','制限なし']]);
    h += sel('cfgBack','連戦', [['soft','なるべく避ける'],['hard','禁止'],['free','気にしない']]);
    h += sel('cfgMix','対戦相手', [['3','できるだけ色々なクラブと'],['1','なるべく色々なクラブと'],['0','気にしない']]);
    h += '<div class="noteRow"><label>同じカードの上限</label>' +
      [[1,'1回まで'],[2,'2回まで'],[3,'3回まで'],[99,'制限なし']].map(v =>
        '<button class="chip' + (+$('cfgSame').value === v[0] ? ' on' : '') +
        '" onclick="$(\'cfgSame\').value=' + v[0] + ';drawWizard();autoSave()">' + v[1] + '</button>').join('') +
      '<span class="hint" style="margin:0">3チームだけなら「制限なし」</span></div>';
    h += '<p class="hint">チームごとの事情（スタッフ1名・上の学年OK・午前のみなど）は、下の<b>参加チームの「特記」</b>で入れてください。</p>';
  }

  h += '<div class="wizNav">' +
    (WSTEP > 0 ? '<button class="btn mini" onclick="wizGo(-1)">← 戻る</button>' : '<span></span>') +
    '<span class="hint" style="margin:0">あとから下の表で直せます</span>' +
    (WSTEP < STEPS.length - 1
      ? '<button class="btn" onclick="wizGo(1)">次へ →</button>'
      : '<button class="btn" onclick="closeWizard();document.getElementById(\'teamBody\').scrollIntoView({behavior:\'smooth\'})">チームを入れる →</button>') +
    '</div>';
  $('wizBody').innerHTML = h;
  $('wizOpen').textContent = '質問を閉じる';
  autoSave();
}
function toggleWizard(){
  if($('wizard').style.display === 'block') closeWizard(); else openWizard();
}

/* ---------- 起動時 ---------- */
(function(){
  document.addEventListener('input', autoSave, true);
  document.addEventListener('change', autoSave, true);
  let saved = null;
  try{
    const raw = localStorage.getItem(WKEY);
    if(raw){const o = JSON.parse(raw); if(o.teams && o.teams.length) saved = o;}
  }catch(e){}
  if(saved){
    const at = saved.savedAt ? saved.savedAt.replace('T',' ').slice(5,16) : '';
    $('resume').innerHTML = '<div class="ok"><b>前回の続きがあります</b>（' + esc(at) + ' 時点／' +
      saved.teams.length + 'チーム）<br>' +
      '<button class="btn mini" onclick="restoreDraft();$(\'resume\').innerHTML=\'\'">続きから始める</button> ' +
      '<button class="btn mini" onclick="clearDraft();$(\'resume\').innerHTML=\'\'">最初から始める</button></div>';
  }
})();
