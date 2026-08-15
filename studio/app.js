/* マッチメイク Studio - 本体
   1日用の ../index.html には手を触れない。こちらは会場・移動時間・採点を持つ上位版。 */
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toMin = s => {const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1]*60 + +m[2] : null;};
const toHM = m => Math.floor(m/60) + ':' + String(m%60).padStart(2,'0');
const toHM2 = m => String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0');
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const PASS = '2001';
(function(){
  if(new URLSearchParams(location.search).get('pw') === PASS){$('gate').remove();return;}
  document.body.style.overflow = 'hidden';
  $('pw').addEventListener('keydown', e => {if(e.key === 'Enter') unlock();});
})();
function unlock(){
  if($('pw').value.trim() === PASS){$('gate').remove();document.body.style.overflow = '';}
  else $('pwe').textContent = 'パスワードが違います';
}

/* ---------- 開催の形（テンプレート） ----------
   初期値を入れるだけ。適用後は自由に上書きでき、変更した項目数を表示する */
const TEMPLATES = [
  {key:'practice', name:'練習試合', desc:'1日・1会場。数チームで本数をそろえる',
   cfg:{cfgCat:'1', cfgBack:'soft', cfgSame:'2', cfgClub:'no', cfgRank:'pref', cfgMix:'1'}},
  {key:'festival', name:'フェスティバル', desc:'1日・複数会場。多くのクラブを回す',
   cfg:{cfgCat:'1', cfgBack:'soft', cfgSame:'1', cfgClub:'no', cfgRank:'pref', cfgMix:'3'}},
  {key:'camp', name:'合宿・遠征受け入れ', desc:'期間もの。相手が偏らないことを最優先',
   cfg:{cfgCat:'1', cfgBack:'free', cfgSame:'1', cfgClub:'no', cfgRank:'pref', cfgMix:'3'}, soon:true},
  {key:'league', name:'リーグ戦', desc:'総当たり。下の「リーグ戦」で組み合わせを作る',
   cfg:{cfgCat:'0', cfgBack:'soft', cfgSame:'1', cfgClub:'no', cfgRank:'free', cfgMix:'0'}}
];
let TPL = 'festival', TPLBASE = {};
function drawTpl(){
  $('tplBox').innerHTML = TEMPLATES.map(t =>
    '<button class="tplcard' + (t.key === TPL ? ' on' : '') + '" onclick="pickTpl(\'' + t.key + '\')">' +
    '<b>' + esc(t.name) + (t.soon ? ' <span style="color:var(--dim);font-weight:600">（設計のみ）</span>' : '') + '</b>' +
    '<span>' + esc(t.desc) + '</span></button>').join('');
  const t = TEMPLATES.filter(x => x.key === TPL)[0];
  $('tplName').textContent = t.name;
  const diff = Object.keys(t.cfg).filter(k => $(k) && $(k).value !== t.cfg[k]);
  $('tplDiff').textContent = diff.length ? '「' + t.name + '」から ' + diff.length + '項目を変更しています' : '';
}
function pickTpl(key){
  const t = TEMPLATES.filter(x => x.key === key)[0];
  if(!t) return;
  if(t.soon && !confirm(t.name + ' はまだ対応していません（設計のみ）。初期値だけ入れますか？')) return;
  TPL = key; TPLBASE = t.cfg;
  Object.keys(t.cfg).forEach(k => {if($(k)) $(k).value = t.cfg[k];});
  drawTpl(); refreshHint(); applyLayout();
  if(key === 'league') drawLeague();
}
/* ---------- 画面の出し分け ----------
   開催の形1つで決まる。判断はここだけに置く。
   data-tpl="festival league" = その形のときだけ出す
   data-tpl="!league"         = その形のときは隠す
   ただし「使っているもの」は隠さない。隠したせいで結果の理由が
   分からなくなるほうが害が大きいため */
function applyLayout(){
  document.querySelectorAll('[data-tpl]').forEach(el => {
    const spec = el.dataset.tpl.trim();
    const show = spec.charAt(0) === '!'
      ? spec.slice(1).split(/\s+/).indexOf(TPL) < 0
      : spec.split(/\s+/).indexOf(TPL) >= 0;
    el.style.display = show ? '' : 'none';
  });
  /* 会場：1つなら名前だけ、2つ以上か複数会場を使う形なら表を出す */
  const many = venueRows().length > 1 || TPL === 'festival' || TPL === 'camp';
  if($('venueWrap')) $('venueWrap').style.display = many ? '' : 'none';
  if($('venueOne')) $('venueOne').style.display = many ? 'none' : '';
  if(!many){
    const v = readVenues()[0];
    if(v && $('fmVenue') && $('fmVenue').value !== v.name) $('fmVenue').value = v.name;
  }
  document.querySelectorAll('.colVenue').forEach(el => {el.style.display = many ? '' : 'none';});
  [...$('courtBody').querySelectorAll('tr')].forEach(tr => {
    const td = tr.children[1];
    if(td) td.style.display = many ? '' : 'none';
  });
  /* 対戦の指定があれば「詳しい設定」を開いておく */
  const n = Object.keys(PAIROV).length;
  if($('moreSum')) $('moreSum').textContent = n ? '対戦の指定 ' + n + '組あり' : '';
  if(n && $('moreBox') && !$('moreBox').open) $('moreBox').open = true;
  /* リーグ戦で自動設定した内容を見せる（隠したまま黙って効かせない） */
  if($('lgAuto')){
    const same = $('cfgSame').value, cat = $('cfgCat').options[$('cfgCat').selectedIndex].textContent;
    $('lgAuto').textContent = TPL === 'league'
      ? '※ このリーグ戦では 同じカードの上限＝' + (same === '99' ? '制限なし' : same + '回') +
        '、カテゴリー差＝' + cat + ' にしています（詳しい設定で変えられます）'
      : '';
  }
}

/* ---------- 会場 ---------- */
let TRAVEL = {};
const tkey = (a,b) => a < b ? a + '|' + b : b + '|' + a;
function travelMin(a,b){return a === b ? 0 : (TRAVEL[tkey(a,b)] || 0);}
function addVenue(name){
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><input class="v-name" value="' + esc(name || '') + '" placeholder="例）白州総合グラウンド"></td>' +
    '<td class="v-travel"></td>' +
    '<td><button class="btn icon" onclick="this.closest(\'tr\').remove();syncVenues()">削除</button></td>';
  $('venueBody').appendChild(tr);
  tr.querySelectorAll('input').forEach(i => i.addEventListener('input', syncVenues));
  syncVenues();
}
function venueRows(){return [...$('venueBody').querySelectorAll('tr')];}
function readVenues(){
  return venueRows().map((tr,i) => ({id:'v' + i, name:tr.querySelector('.v-name').value.trim() || ('会場' + (i+1))}));
}
/* 移動時間の入力欄を作り直す。値は名前ではなく行番号で持つ */
function syncVenues(){
  const vs = readVenues();
  venueRows().forEach((tr,i) => {
    const cell = tr.querySelector('.v-travel');
    const others = vs.filter((_,j) => j < i);
    if(!others.length){cell.innerHTML = '<span class="hint" style="margin:0">最初の会場です</span>';return;}
    const cur = {};
    cell.querySelectorAll('input[data-to]').forEach(inp => cur[inp.dataset.to] = inp.value);
    cell.innerHTML = others.map(o =>
      '<span style="display:inline-flex;align-items:center;gap:5px;margin:0 10px 5px 0;font-size:12px">' +
      esc(o.name) + '<input type="number" min="0" max="180" data-to="' + o.id + '" style="width:66px" value="' +
      (cur[o.id] !== undefined ? cur[o.id] : (TRAVEL[tkey(o.id, vs[i].id)] || 0)) + '">分</span>').join('');
    cell.querySelectorAll('input').forEach(inp => inp.addEventListener('input', readTravel));
  });
  readTravel();
  syncCourtVenues();
  $('venueHint').textContent = vs.length + '会場';
}
function readTravel(){
  TRAVEL = {};
  const vs = readVenues();
  venueRows().forEach((tr,i) => {
    tr.querySelectorAll('input[data-to]').forEach(inp => {
      const v = parseInt(inp.value,10) || 0;
      if(v > 0) TRAVEL[tkey(inp.dataset.to, vs[i].id)] = v;
    });
  });
}

/* ---------- 面（コート） ---------- */
function addCourt(d){
  d = d || {name:'', venue:0, from:'08:30', to:'12:30', match:25, interval:30, cats:''};
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="c-name" value="' + esc(d.name) + '" placeholder="例）Aコート"></td>' +
    '<td><select class="c-venue"></select></td>' +
    '<td><input class="c-from" type="time" step="900" value="' + d.from + '" style="width:104px"></td>' +
    '<td><input class="c-to" type="time" step="900" value="' + d.to + '" style="width:104px"></td>' +
    '<td><input class="c-match" type="number" value="' + d.match + '" min="5" max="120" style="width:62px"></td>' +
    '<td><input class="c-int" type="number" value="' + d.interval + '" min="5" max="180" style="width:62px"></td>' +
    '<td><input class="c-cats" value="' + esc(d.cats || '') + '" placeholder="制限なし"></td>' +
    '<td><button class="btn icon" onclick="this.closest(\'tr\').remove();refreshHint()">削除</button></td>';
  $('courtBody').appendChild(tr);
  syncCourtVenues();
  tr.querySelector('.c-venue').value = String(d.venue || 0);
  tr.querySelectorAll('input,select').forEach(i => i.addEventListener('input', refreshHint));
  refreshHint();
}
function syncCourtVenues(){
  const vs = readVenues();
  [...$('courtBody').querySelectorAll('.c-venue')].forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = vs.map((v,i) => '<option value="' + i + '">' + esc(v.name) + '</option>').join('');
    sel.value = (cur !== '' && +cur < vs.length) ? cur : '0';
  });
}
function readCourts(){
  const vs = readVenues();
  return [...$('courtBody').querySelectorAll('tr')].map((tr,i) => {
    const g = c => tr.querySelector('.' + c);
    const vi = Math.min(+g('c-venue').value || 0, Math.max(0, vs.length - 1));
    const cats = g('c-cats').value.trim();
    return {ci:i, name:g('c-name').value.trim() || ('第' + (i+1) + '面'),
      venueId: vs[vi] ? vs[vi].id : 'v0', venueName: vs[vi] ? vs[vi].name : '会場',
      from:toMin(g('c-from').value), to:toMin(g('c-to').value),
      match:+g('c-match').value || 25, interval:+g('c-int').value || 30,
      cats:cats, catList:cats ? cats.split(/[,、\s]+/).filter(Boolean) : []};
  });
}

/* ---------- チーム ---------- */
/* チームのKO可能時間の既定値。面の使用時間に合わせる。
   最終KOは「使用終了 － 試合時間」＝最後にキックオフできる時刻 */
function defaultWindow(){
  const cs = readCourts().filter(c => c.from != null && c.to != null && c.to > c.from);
  if(!cs.length) return {from:'08:30', to:'12:00'};
  const from = Math.min.apply(null, cs.map(c => c.from));
  const to = Math.max.apply(null, cs.map(c => c.to - c.match));
  return {from:toHM2(from), to:toHM2(Math.max(from, to))};
}
/* 全チームの時間を面に合わせる（押したときだけ動く。勝手には書き換えない） */
function fitTeamTimes(){
  const w = defaultWindow(), rows = [...$('teamBody').querySelectorAll('tr')];
  if(!rows.length) return;
  if(!confirm('全チームの初戦KO・最終KOを ' + w.from + '〜' + w.to + ' にそろえます。よろしいですか？\n（このあと個別に直せます）')) return;
  rows.forEach(tr => {tr.querySelector('.t-from').value = w.from; tr.querySelector('.t-to').value = w.to;});
  refreshHint();
}
function splitRank(n){
  const m = String(n).match(/^(.+?[0-9\s\-‐・])\s*([ABC])$/);
  return m ? {club:m[1].trim(), rank:m[2]} : {club:String(n), rank:''};
}
function addTeam(d){
  const w = defaultWindow();
  d = Object.assign({name:'', cat:'U15', players:15, target:3}, d || {});
  /* 時間の指定が無ければ面の使用時間に合わせる */
  if(!d.from) d.from = w.from;
  if(!d.to) d.to = w.to;
  const sr = splitRank(d.name);
  const tr = document.createElement('tr');
  tr.innerHTML =
    '<td><input class="t-name" value="' + esc(d.name) + '" placeholder="チーム名"></td>' +
    '<td><input class="t-club" value="' + esc(d.club !== undefined ? d.club : sr.club) + '" style="width:106px" placeholder="自動"></td>' +
    '<td><input class="t-rank" value="' + esc(d.rank !== undefined ? d.rank : sr.rank) + '" style="width:44px;text-align:center" placeholder="－"></td>' +
    '<td><input class="t-cat" value="' + esc(d.cat) + '" style="width:62px"></td>' +
    '<td><input class="t-num" type="number" value="' + d.players + '" min="1" style="width:56px"></td>' +
    '<td><input class="t-from" type="time" step="900" value="' + d.from + '" style="width:104px"></td>' +
    '<td><input class="t-to" type="time" step="900" value="' + d.to + '" style="width:104px"></td>' +
    '<td><input class="t-tgt" type="number" value="' + d.target + '" min="0" max="12" style="width:52px"></td>' +
    '<td style="text-align:center"><input class="t-dual" type="checkbox" ' + (d.dual ? 'checked' : '') + ' style="width:auto"></td>' +
    '<td style="text-align:center"><input class="t-burst" type="checkbox" ' + (d.burst ? 'checked' : '') + ' style="width:auto"></td>' +
    '<td style="text-align:center"><input class="t-home" type="checkbox" ' + (d.home ? 'checked' : '') + ' style="width:auto"></td>' +
    '<td class="t-noteCell"></td>' +
    '<td><button class="btn icon" onclick="this.closest(\'tr\').remove();refreshHint()">削除</button></td>';
  $('teamBody').appendChild(tr);
  /* 特記（イレギュラー）は行に持たせる。表には要約だけ出す */
  tr.dataset.catUp = d.catUp || 0;
  tr.dataset.catDown = d.catDown || 0;
  tr.dataset.staffLimit = d.staffLimit || 0;   /* 0 = 制限なし */
  tr.dataset.note = d.note || '';
  drawNoteCell(tr);
  tr.querySelectorAll('input').forEach(i => i.addEventListener('input', refreshHint));
  refreshHint();
}
/* ---------- 特記（イレギュラー）---------- */
const NOTECHIPS = [
  {key:'late',  label:'遅れて到着',  ask:'初戦KOは何時からですか？'},
  {key:'early', label:'早く帰る',    ask:'最終試合のKOは何時までですか？'},
  {key:'am',    label:'午前のみ'},
  {key:'staff', label:'スタッフ1名（同時開催不可）'},
  {key:'up',    label:'上の学年ともOK'},
  {key:'down',  label:'下の学年ともOK'},
  {key:'dual',  label:'2面同時に出せる'},
  {key:'burst', label:'連戦してもよい'},
  {key:'note',  label:'その他（自由記述）'}
];
function trOf(i){return [...$('teamBody').querySelectorAll('tr')][i];}
/* 行に付いている特記の要約 */
function noteTags(tr){
  const t = [];
  if(+tr.dataset.staffLimit) t.push('スタッフ' + tr.dataset.staffLimit + '名');
  if(+tr.dataset.catUp) t.push('上' + tr.dataset.catUp + '学年OK');
  if(+tr.dataset.catDown) t.push('下' + tr.dataset.catDown + '学年OK');
  if(tr.querySelector('.t-dual') && tr.querySelector('.t-dual').checked) t.push('2面同時');
  if(tr.querySelector('.t-burst') && tr.querySelector('.t-burst').checked) t.push('連戦OK');
  if(tr.dataset.note) t.push('メモ');
  return t;
}
function drawNoteCell(tr){
  const cell = tr.querySelector('.t-noteCell');
  if(!cell) return;
  const i = [...$('teamBody').querySelectorAll('tr')].indexOf(tr);
  const tags = noteTags(tr);
  cell.innerHTML = '<button class="chipbtn" onclick="openNote(' + i + ')">' +
    (tags.length ? tags.map(x => '<span class="chiptag">' + esc(x) + '</span>').join('') : '＋ 特記') + '</button>';
}
function redrawNotes(){[...$('teamBody').querySelectorAll('tr')].forEach(drawNoteCell);}
let NOTEROW = null;
function openNote(i){NOTEROW = (NOTEROW === i) ? null : i; drawNotePanel();}
function closeNote(){NOTEROW = null; drawNotePanel();}
function noteSet(key,val){
  const tr = trOf(NOTEROW); if(!tr) return;
  const t = readTeams()[NOTEROW];
  if(key === 'staff'){
    tr.dataset.staffLimit = val ? 1 : 0;
    if(val && tr.querySelector('.t-dual').checked) tr.querySelector('.t-dual').checked = false;
  }
  if(key === 'up')   tr.dataset.catUp = val ? 1 : 0;
  if(key === 'down') tr.dataset.catDown = val ? 1 : 0;
  if(key === 'dual'){
    tr.querySelector('.t-dual').checked = val;
    if(val) tr.dataset.staffLimit = 0;
  }
  if(key === 'burst') tr.querySelector('.t-burst').checked = val;
  if(key === 'am' && val){
    tr.querySelector('.t-from').value = '08:30';
    tr.querySelector('.t-to').value = '12:00';
  }
  drawNotePanel(); refreshHint();
}
function noteNum(key,val){
  const tr = trOf(NOTEROW); if(!tr) return;
  if(key === 'staff') tr.dataset.staffLimit = Math.max(1, +val || 1);
  if(key === 'up')    tr.dataset.catUp = Math.max(0, Math.min(3, +val || 0));
  if(key === 'down')  tr.dataset.catDown = Math.max(0, Math.min(3, +val || 0));
  drawNotePanel(); refreshHint();
}
function noteTime(which,val){
  const tr = trOf(NOTEROW); if(!tr) return;
  tr.querySelector(which === 'from' ? '.t-from' : '.t-to').value = val;
  refreshHint(); drawNotePanel();
}
function noteText(val){
  const tr = trOf(NOTEROW); if(!tr) return;
  tr.dataset.note = val;
  redrawNotes();
}
function drawNotePanel(){
  const box = $('notePanel');
  if(NOTEROW === null || !trOf(NOTEROW)){box.style.display = 'none'; box.innerHTML = ''; redrawNotes(); return;}
  const tr = trOf(NOTEROW), teams = readTeams(), t = teams[NOTEROW];
  if(!t){box.style.display = 'none'; return;}
  const on = k => k === 'staff' ? !!+tr.dataset.staffLimit
    : k === 'up' ? !!+tr.dataset.catUp
    : k === 'down' ? !!+tr.dataset.catDown
    : k === 'dual' ? tr.querySelector('.t-dual').checked
    : k === 'burst' ? tr.querySelector('.t-burst').checked
    : k === 'note' ? !!tr.dataset.note : false;
  let h = '<div class="noteHead"><b>' + esc(t.name || '（チーム名なし）') + '</b> の特記' +
    '<button class="btn mini" onclick="closeNote()" style="margin-left:auto">閉じる</button></div>';
  h += '<div class="chips">' + NOTECHIPS.filter(c => c.key !== 'late' && c.key !== 'early' && c.key !== 'am')
    .map(c => '<button class="chip' + (on(c.key) ? ' on' : '') + '" onclick="' +
      (c.key === 'note' ? 'noteFocus()' : 'noteSet(\'' + c.key + '\',' + (!on(c.key)) + ')') + '">' +
      esc(c.label) + '</button>').join('') + '</div>';
  /* 時間の申告 */
  h += '<div class="noteRow"><label>出られる時間</label>' +
    '<span class="ni">初戦KO <input type="time" step="900" value="' + toHM2(t.from) + '" onchange="noteTime(\'from\',this.value)"></span>' +
    '<span class="ni">最終KO <input type="time" step="900" value="' + toHM2(t.to) + '" onchange="noteTime(\'to\',this.value)"></span>' +
    '<button class="chip" onclick="noteSet(\'am\',true)">午前のみにする</button></div>';
  /* 数値の追加入力 */
  if(on('staff')) h += '<div class="noteRow"><label>同時に出せる試合数</label>' +
    '<input type="number" min="1" max="4" value="' + (+tr.dataset.staffLimit || 1) + '" onchange="noteNum(\'staff\',this.value)" style="width:80px">' +
    '<span class="hint" style="margin:0">帯同スタッフの数。このクラブは同じ時間にこの数までしか試合できません</span></div>';
  if(on('up')) h += '<div class="noteRow"><label>上へ何学年まで</label>' +
    '<input type="number" min="1" max="3" value="' + (+tr.dataset.catUp || 1) + '" onchange="noteNum(\'up\',this.value)" style="width:80px"></div>';
  if(on('down')) h += '<div class="noteRow"><label>下へ何学年まで</label>' +
    '<input type="number" min="1" max="3" value="' + (+tr.dataset.catDown || 1) + '" onchange="noteNum(\'down\',this.value)" style="width:80px"></div>';
  /* スタッフ制約はクラブ単位なので、同じクラブの他チームを必ず見せる */
  if(on('staff')){
    const mates = teams.filter(o => o.id !== t.id && clubOf(o) === clubOf(t));
    h += '<div class="' + (mates.length ? 'ok' : 'alert') + '" style="margin:9px 0">' +
      (mates.length
        ? '<b>「' + esc(clubOf(t)) + '」として ' + mates.map(o => esc(o.name)).join('、') + ' と同じ扱いになります。</b><br>この中で同時に試合が組まれなくなります。違っていればクラブ欄を直してください。'
        : '<b>このクラブは ' + esc(t.name) + ' の1チームだけです。</b><br>他にも同じクラブのチームがいる場合は、クラブ欄を同じ名前にそろえてください。そろっていないと同時開催の制限が効きません。');
    h += '</div>';
  }
  if(on('staff') && tr.querySelector('.t-dual').checked)
    h += '<div class="alert" style="margin:9px 0">「スタッフ1名」と「2面同時」は同時に指定できません。スタッフの指定を優先します。</div>';
  /* その他は生成に効かないことを常時明示する */
  h += '<div class="noteRow" style="align-items:flex-start"><label>その他</label>' +
    '<textarea id="noteText" rows="2" style="flex:1;min-width:200px" placeholder="例）GKが不在です／到着が遅れる可能性あり" ' +
    'oninput="noteText(this.value)">' + esc(tr.dataset.note || '') + '</textarea></div>' +
    '<p class="hint" style="color:var(--warn);font-weight:700">この欄の内容は自動では反映されません。印刷の連絡事項に載ります。</p>';
  box.innerHTML = h;
  box.style.display = 'block';
  redrawNotes();
}
function noteFocus(){const e = $('noteText'); if(e){e.focus();}}

function autoClub(tell){
  const rows = [...$('teamBody').querySelectorAll('tr')];
  const names = rows.map(tr => tr.querySelector('.t-name').value.trim());
  const cand = names.map(n => {
    const m = n.match(/^(.*?)[\s\-‐・]*([ABC])$/);
    return m && m[1].trim() ? {base:m[1].trim(), rank:m[2]} : null;
  });
  let n = 0;
  rows.forEach((tr,i) => {
    const c = cand[i]; if(!c) return;
    const bro = cand.some((o,j) => j !== i && o && o.base === c.base && o.rank !== c.rank);
    const strict = /[0-9\s\-‐・]$/.test(names[i].slice(0,-1));
    if(!bro && !strict) return;
    tr.querySelector('.t-club').value = c.base;
    tr.querySelector('.t-rank').value = c.rank;
    n++;
  });
  if(tell) $('teamHint').textContent = n ? n + 'チームにクラブとランクを設定しました' : 'A / B / C の付いたチーム名は見つかりませんでした';
  else refreshHint();
}
function readTeams(){
  return [...$('teamBody').querySelectorAll('tr')].map((tr,i) => {
    const g = c => tr.querySelector('.' + c);
    const raw = g('t-cat').value.trim(), m = raw.match(/\d+/), nm = g('t-name').value.trim(), sr = splitRank(nm);
    return {id:i, name:nm, catRaw:raw, cat:m ? +m[0] : null,
      club:g('t-club').value.trim() || sr.club, rank:g('t-rank').value.trim().toUpperCase(),
      players:+g('t-num').value || 0, from:toMin(g('t-from').value), to:toMin(g('t-to').value),
      target:+g('t-tgt').value || 0, dual:g('t-dual').checked, burst:g('t-burst').checked, home:g('t-home').checked,
      catUp:+tr.dataset.catUp || 0, catDown:+tr.dataset.catDown || 0,
      staffLimit:+tr.dataset.staffLimit || 0, note:tr.dataset.note || ''};
  }).filter(t => t.name);
}
function refreshHint(){
  const ts = readTeams(), sum = ts.reduce((a,b) => a + b.target, 0);
  const cs = readCourts();
  $('teamHint').textContent = ts.length + 'チーム／希望本数 合計 ' + sum + '本 → 必要試合数 ' + (sum/2) + (sum%2 ? '（奇数なので1本余ります）' : '');
  $('courtHint').textContent = cs.length + '面';
  if($('pairBox').style.display !== 'none') drawPairs(); else refreshPairHint();
  drawTpl(); applyLayout();
}

/* ---------- 判定の共通部品 ---------- */
const pk = (a,b) => a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
const ORGCUT = /[\s\-‐・]*(?:U-?\d{1,2}|[1-6]年生?|中[1-3]|小[1-6]|ジュニアユース|ユース|ジュニア)$/i;
function clubOf(t){
  let s = (t.club || t.name || '').trim();
  for(let i=0;i<2;i++){const n = s.replace(ORGCUT,'').trim(); if(n === s || !n) break; s = n;}
  return s || t.club || t.name || ('#' + t.id);
}
const sameClubP = (a,b) => !!(a.club && b.club && a.club === b.club);
function catDiff(a,b){
  if(a.cat == null || b.cat == null) return a.catRaw === b.catRaw ? 0 : null;
  return Math.abs(a.cat - b.cat);
}
/* 学年差を許すか。生成器と採点の両方がこの1本を使う。
   「上の学年ともOK」は年下側の申告、「下の学年ともOK」は年上側の申告で、
   どちらか片方が許していれば成立させる（両者の同意を求めると入力が倍になる） */
function catOK(a,b,maxCat){
  const d = catDiff(a,b);
  if(d === null) return false;
  if(d <= maxCat) return true;
  const younger = (a.cat == null || b.cat == null) ? null : (a.cat < b.cat ? a : b);
  const older   = (a.cat == null || b.cat == null) ? null : (a.cat < b.cat ? b : a);
  if(younger && (younger.catUp || 0) >= d) return true;
  if(older && (older.catDown || 0) >= d) return true;
  return false;
}
/* クラブごとに同時に出せる試合数。同じクラブで値が違えば最小値を採る。0 = 制限なし */
function staffLimits(teams){
  const m = {};
  teams.forEach(t => {
    const c = clubOf(t), v = t.staffLimit || 0;
    if(!v) return;
    m[c] = m[c] === undefined ? v : Math.min(m[c], v);
  });
  return m;
}
/* そのセルに置いたとき、クラブの同時出場上限を超えないか */
function staffOK(team,cell,asg,cells,limits,skipIdx){
  const c = clubOf(team), lim = limits[c];
  if(!lim) return true;
  let n = 0;
  asg.forEach((m,k) => {
    if(!m || k === skipIdx) return;
    const cc = cells[k];
    if(!(cc.start < cell.end && cell.start < cc.end)) return;
    if(clubOf(m.a) === c || clubOf(m.b) === c) n++;
  });
  return n < lim;
}
const fitsCourt = (t,c) => !c.catList.length || c.catList.indexOf(t.catRaw) >= 0;
const inWindow = (t,cell) => t.from <= cell.start && cell.start <= t.to;
function ovl(list,cell){let n=0;for(const s of list) if(cell.start < s.end && s.start < cell.end) n++; return n;}
function minGap(list,cell){
  let g = Infinity;
  for(const s of list) g = Math.min(g, s.end <= cell.start ? cell.start - s.end : s.start - cell.end);
  return g;
}
/* 会場をまたぐとき、移動時間ぶんの空きがあるか */
function travelOK(list,cell,courts){
  const v = courts[cell.ci].venueId;
  for(const s of list){
    const sv = courts[s.ci].venueId;
    if(sv === v) continue;
    const need = travelMin(sv, v);
    if(need <= 0) continue;
    const gap = s.end <= cell.start ? cell.start - s.end : (cell.end <= s.start ? s.start - cell.end : -1);
    if(gap < need) return false;
  }
  return true;
}

/* ---------- 対戦してよい組み合わせ ---------- */
let PAIROV = {}, PAIRSEL = 0;
const povk = (a,b) => {const x = a.name !== undefined ? a.name : a, y = b.name !== undefined ? b.name : b;
  return JSON.stringify(x < y ? [x,y] : [y,x]);};
const povGet = (a,b) => PAIROV[povk(a,b)];
function pairCfg(){return {maxCat:+$('cfgCat').value, club:$('cfgClub').value, rank:$('cfgRank').value};}
function pairAuto(a,b,cfg){
  if(sameClubP(a,b) && cfg.club === 'no') return false;
  if(!catOK(a,b,cfg.maxCat)) return false;
  if(a.rank && b.rank && a.rank !== b.rank && cfg.rank === 'only') return false;
  return true;
}
/* false=しない / true=対戦する / 'want'=必ず1本 / 'want2'=必ず2本（リーグ戦の2周） */
const isWant = v => v === 'want' || v === 'want2';
const wantN = v => v === 'want2' ? 2 : v === 'want' ? 1 : 0;
const normWant = v => v === 'want2' ? 'want2' : v === 'want' ? 'want' : !!v;
function pairState(a,b,cfg){
  const locked = sameClubP(a,b) && cfg.club === 'no';
  const ov = povGet(a,b);
  return {locked:locked, explicit: !locked && ov !== undefined, want: !locked && isWant(ov), wantN: wantN(ov),
    allowed: locked ? false : (ov !== undefined ? ov !== false : pairAuto(a,b,cfg))};
}
function pairWhy(a,b,cfg){
  const st = pairState(a,b,cfg);
  if(st.allowed) return '';
  if(st.locked) return '同じクラブ';
  if(st.explicit) return '「対戦しない」と指定';
  if(!catOK(a,b,cfg.maxCat)) return 'カテゴリー差が範囲外';
  if(a.rank && b.rank && a.rank !== b.rank && cfg.rank === 'only') return 'ランク違い';
  return '組めない組み合わせ';
}
function pairCount(t,teams,cfg){let n=0;teams.forEach(o => {if(o.id !== t.id && pairState(t,o,cfg).allowed) n++;});return n;}
function togglePairs(){
  const b = $('pairBox'), open = b.style.display === 'none';
  b.style.display = open ? 'block' : 'none';
  $('pairToggle').textContent = open ? '指定を閉じる' : '組み合わせを指定する';
  if(open) drawPairs();
}
function pairPick(i){PAIRSEL = i; drawPairs();}
/* 押すたび 対戦する → 必ず当てる → しない → （ルールどおり）と巡回する */
function pairSet(j){
  const teams = readTeams(), cfg = pairCfg(), a = teams[PAIRSEL], b = teams[j];
  if(!a || !b) return;
  const st = pairState(a,b,cfg);
  if(st.locked) return;
  const k = povk(a,b), cur = PAIROV[k];
  let next;
  if(cur === undefined) next = pairAuto(a,b,cfg) ? 'want' : true;
  else if(cur === true) next = 'want';
  else if(isWant(cur)) next = false;
  else next = undefined;
  if(next === undefined || next === pairAuto(a,b,cfg)) delete PAIROV[k]; else PAIROV[k] = next;
  drawPairs();
}
function pairPreset(mode){
  const teams = readTeams(), cfg = pairCfg();
  PAIROV = {};
  if(mode === 'all') teams.forEach((a,i) => teams.forEach((b,j) => {
    if(j <= i) return;
    if(!(sameClubP(a,b) && cfg.club === 'no') && !pairAuto(a,b,cfg)) PAIROV[povk(a,b)] = true;
  }));
  drawPairs();
}
function refreshPairHint(){
  const n = Object.keys(PAIROV).length;
  $('pairHint').textContent = n ? n + '組を手で指定しています' : 'いまはランク・カテゴリーのルールどおりです';
}
function drawPairs(){
  const teams = readTeams(), cfg = pairCfg();
  if(teams.length < 2){
    $('pairLeft').innerHTML = '<div class="pairHead">チームを2つ以上入れてください</div>';
    $('pairRight').innerHTML = ''; $('pairRightHead').textContent = ''; $('pairSum').textContent = '';
    refreshPairHint(); return;
  }
  if(PAIRSEL >= teams.length) PAIRSEL = 0;
  const sel = teams[PAIRSEL];
  const meta = t => esc(t.catRaw) + (t.rank ? ' / ' + esc(t.rank) : '');
  $('pairLeft').innerHTML = '<div class="pairHead">チーム（相手の数）</div>' +
    teams.map((t,i) => {
      const n = pairCount(t,teams,cfg);
      return '<button class="pairRow' + (i === PAIRSEL ? ' on' : '') + '" onclick="pairPick(' + i + ')">' +
        '<span class="pnm">' + esc(t.name) + '<span class="pmeta">' + meta(t) + '</span></span>' +
        '<span class="ptag ' + (n <= 1 ? 'few' : 'lock') + '">' + n + 'チーム</span></button>';
    }).join('');
  $('pairRightHead').textContent = sel.name + ' が対戦してよい相手';
  $('pairRight').innerHTML = teams.map((t,j) => {
    if(j === PAIRSEL) return '';
    const st = pairState(sel,t,cfg);
    const tag = st.locked ? '<span class="ptag lock">同クラブ</span>' :
      st.want ? '<span class="ptag want">必ず' + (st.wantN > 1 ? st.wantN + '本' : '当てる') + ' ●</span>' :
      '<span class="ptag ' + (st.allowed ? 'yes' : 'no') + '">' + (st.allowed ? '対戦する' : 'しない') + (st.explicit ? ' ●' : '') + '</span>';
    return '<button class="pairRow" ' + (st.locked ? 'disabled' : 'onclick="pairSet(' + j + ')"') + '>' +
      '<span class="pnm">' + esc(t.name) + '<span class="pmeta">' + meta(t) + '</span></span>' + tag + '</button>';
  }).join('');
  let ok = 0, all = 0, want = 0;
  teams.forEach((a,i) => teams.forEach((b,j) => {if(j <= i) return; all++;
    const s = pairState(a,b,cfg); if(s.allowed) ok++; if(s.want) want++;}));
  const few = teams.filter(t => pairCount(t,teams,cfg) <= 1);
  $('pairSum').innerHTML = '対戦してよいペア ' + ok + ' / ' + all +
    (want ? '　うち「必ず当てる」' + want + '組' : '') + '　押すたびに 対戦する→必ず当てる→しない と変わります。' +
    (few.length ? '<br><b style="color:var(--warn)">相手が1チーム以下：' + few.map(t => esc(t.name)).join('、') + '</b>' : '');
  refreshPairHint();
}

/* ---------- 生成器 ---------- */
let BRKS = {};
function makeCells(courts){
  const cells = [];
  courts.forEach(c => {
    let t = c.from, g = 0;
    while(t + c.match <= c.to && g++ < 90){cells.push({ci:c.ci, start:t, end:t + c.match}); t += c.interval;}
  });
  cells.sort((a,b) => a.start - b.start || a.ci - b.ci);
  return cells;
}
function build(teams,courts,cells,cfg,seed,w){
  const rnd = mulberry32(seed), played = {}, mine = {}, pairs = {}, asg = new Array(cells.length).fill(null);
  const avCnt = {}, orgList = [], org = [], met = [];
  const limits = staffLimits(teams);
  teams.forEach(t => {const o = clubOf(t); let k = orgList.indexOf(o); if(k < 0){k = orgList.length; orgList.push(o);} org[t.id] = k;});
  teams.forEach(t => {played[t.id] = 0; mine[t.id] = []; met[t.id] = new Int32Array(orgList.length);
    avCnt[t.id] = cells.filter(c => inWindow(t,c) && fitsCourt(t,courts[c.ci])).length;});
  const limArr = orgList.map(o => limits[o] || 0);
  const anyLimit = limArr.some(v => v > 0);
  cells.forEach((cell,idx) => {
    const court = courts[cell.ci], rest = court.interval;
    let best = null, bs = -1e9;
    /* このクラブ（整数）が、この時間にまだ試合を入れられるか */
    const staffFree = oi => {
      const lim = limArr[oi];
      if(!lim) return true;
      let n = 0;
      for(let k=0;k<asg.length;k++){
        const m = asg[k]; if(!m) continue;
        const cc = cells[k];
        if(!(cc.start < cell.end && cell.start < cc.end)) continue;
        if(org[m.a.id] === oi || org[m.b.id] === oi) n++;
      }
      return n < lim;
    };
    for(let i=0;i<teams.length;i++) for(let j=i+1;j<teams.length;j++){
      const a = teams[i], b = teams[j];
      if(!inWindow(a,cell) || !inWindow(b,cell)) continue;
      if(!fitsCourt(a,court) || !fitsCourt(b,court)) continue;
      if(played[a.id] >= a.target || played[b.id] >= b.target) continue;
      if(ovl(mine[a.id],cell) >= (a.dual ? 2 : 1)) continue;
      if(ovl(mine[b.id],cell) >= (b.dual ? 2 : 1)) continue;
      /* 会場移動が間に合わない配置は作らない */
      if(!travelOK(mine[a.id],cell,courts) || !travelOK(mine[b.id],cell,courts)) continue;
      const ov = cfg.ov ? cfg.ov[i][j] : undefined;
      if(ov === false) continue;
      const want = isWant(ov), needN = wantN(ov);
      const cd = catDiff(a,b);
      const cOK = cfg.catM ? cfg.catM[i][j] : catOK(a,b,cfg.maxCat);
      if(!(ov === true || want) && !cOK) continue;
      if((pairs[pk(a,b)] || 0) >= cfg.maxSame) continue;
      /* スタッフが1名などで、同じクラブが同時に何試合まで出せるか。
         申告があるときだけ調べる（無いときにクラブ名を毎回作ると目に見えて遅くなる） */
      if(anyLimit && (!staffFree(org[a.id]) || !staffFree(org[b.id]))) continue;
      const sameClub = sameClubP(a,b);
      if(sameClub && cfg.club === 'no') continue;
      const cRep = met[a.id][org[b.id]] + met[b.id][org[a.id]];
      const rankBad = !!(a.rank && b.rank && a.rank !== b.rank);
      if(rankBad && cfg.rank === 'only' && !ov) continue;
      const ga = minGap(mine[a.id],cell), gb = minGap(mine[b.id],cell);
      /* 連戦OKのチームは連戦の制限をかけない */
      const gaBad = !a.burst && ga < rest, gbBad = !b.burst && gb < rest;
      if(cfg.back === 'hard' && (gaBad || gbBad)) continue;
      const na = a.target - played[a.id], nb = b.target - played[b.id];
      let sc = (na + nb)*10 - (ov || (cOK && (cd||0) > cfg.maxCat) ? 0 : (cd || 0))*w.cat
        - (pairs[pk(a,b)] || 0)*w.rep - cRep*(w.club || 0);
      /* 「必ず当てる」と指定された組は強く優先する（ハードにはしない）。
         2周のリーグ戦なら2本目まで優先する */
      if(want && (pairs[pk(a,b)] || 0) < needN) sc += (w.want || 260);
      if(sameClub) sc -= 300;
      if(rankBad && cfg.rank === 'pref' && !ov) sc -= 200;
      if(cfg.back !== 'free') sc -= ((gaBad ? 1 : 0) + (gbBad ? 1 : 0))*w.back;
      /* 会場が変わること自体を少し嫌う */
      if(w.move){
        const v = courts[cell.ci].venueId;
        if(mine[a.id].some(s => courts[s.ci].venueId !== v)) sc -= w.move;
        if(mine[b.id].some(s => courts[s.ci].venueId !== v)) sc -= w.move;
      }
      sc += (avCnt[a.id] ? na/avCnt[a.id] : 0)*22 + (avCnt[b.id] ? nb/avCnt[b.id] : 0)*22;
      sc += rnd()*w.noise;
      if(sc > bs){bs = sc; best = [a,b];}
    }
    teams.forEach(t => {if(inWindow(t,cell) && fitsCourt(t,courts[cell.ci]) && avCnt[t.id] > 0) avCnt[t.id]--;});
    if(!best) return;
    const a = best[0], b = best[1];
    asg[idx] = {a:a, b:b, cell:cell};
    mine[a.id].push(cell); mine[b.id].push(cell);
    played[a.id]++; played[b.id]++;
    pairs[pk(a,b)] = (pairs[pk(a,b)] || 0) + 1;
    met[a.id][org[b.id]]++; met[b.id][org[a.id]]++;
  });
  return {cells:cells, asg:asg, played:played, courts:courts};
}
const PLANS = [
  {name:'バランス型', desc:'本数・休憩・対戦相手をまんべんなく', w:{cat:6, rep:14, club:26, back:8, move:14, noise:7}},
  {name:'休憩たっぷり', desc:'連戦をできる限り作らない', w:{cat:6, rep:12, club:20, back:60, move:14, noise:6}},
  {name:'相手をバラす', desc:'色々なクラブと当たれるように最優先', w:{cat:5, rep:70, club:90, back:8, move:10, noise:6}},
  {name:'移動を減らす', desc:'同じ会場でまとめて終わらせる', w:{cat:6, rep:14, club:24, back:8, move:70, noise:6}},
  {name:'同学年優先', desc:'カテゴリー差のある対戦を避ける', w:{cat:45, rep:14, club:24, back:8, move:14, noise:6}}
];

/* ---------- リーグ戦（総当たり） ----------
   対戦カードを先に決めて「必ず当てる」として登録し、希望本数を自動で設定する。
   こうすると生成器・採点・手直しがそのまま使える（別の仕組みを作らない） */
function leagueGroups(){
  const teams = readTeams(), by = $('lgBy') ? $('lgBy').value : 'cat', gs = {};
  teams.forEach(t => {
    const k = by === 'all' ? '全チーム'
            : by === 'rank' ? (t.catRaw || '未設定') + (t.rank ? ' ' + t.rank : '')
            : (t.catRaw || '未設定');
    (gs[k] = gs[k] || []).push(t);
  });
  return Object.keys(gs).map(k => ({name:k, teams:gs[k]})).filter(g => g.teams.length >= 2);
}
function leaguePairs(g){
  const out = [];
  for(let i=0;i<g.teams.length;i++) for(let j=i+1;j<g.teams.length;j++){
    const a = g.teams[i], b = g.teams[j];
    if(sameClubP(a,b) && $('cfgClub').value === 'no') continue;  /* 同じクラブ同士は組まない */
    out.push([a,b]);
  }
  return out;
}
function lgRounds(){return $('lgRounds') ? +$('lgRounds').value : 1;}
function drawLeague(){
  const gs = leagueGroups(), rounds = lgRounds();
  if(!gs.length){$('leagueBox').innerHTML = '<div class="alert">2チーム以上のグループがありません。参加チームを入れてください。</div>';return;}
  const cells = makeCells(readCourts());
  let total = 0, h = '<div class="scroll"><table class="tbl"><thead><tr>' +
    '<th>グループ</th><th>チーム</th><th>試合数</th><th>1チームあたり</th></tr></thead><tbody>';
  gs.forEach(g => {
    const ps = leaguePairs(g); total += ps.length * rounds;
    h += '<tr><td style="font-weight:700;white-space:nowrap">' + esc(g.name) + '</td>' +
      '<td style="font-size:12.5px">' + g.teams.map(t => esc(t.name)).join('、') + '</td>' +
      '<td style="white-space:nowrap">' + (ps.length * rounds) + '試合' +
      (rounds > 1 ? '<span style="color:var(--dim);font-size:11px">（' + ps.length + '×' + rounds + '周）</span>' : '') + '</td>' +
      '<td style="white-space:nowrap">' + ((g.teams.length - 1) * rounds) + '本</td></tr>';
  });
  h += '</tbody></table></div>';
  h += '<div class="' + (total > cells.length ? 'alert' : 'ok') + '" style="margin-top:11px">' +
    '<b>合計 ' + total + '試合／枠は ' + cells.length + '</b>　' +
    (total > cells.length
      ? '枠が' + (total - cells.length) + '試合ぶん足りません。使用時間を延ばすか面を増やすか、グループを分けてください。'
      : '枠は足りています。') + '</div>';
  h += '<div class="row-actions"><button class="btn" onclick="applyLeague()">この組み合わせで設定する</button>' +
    '<span class="hint" style="margin:0">希望本数と「必ず当てる」を自動で入れます。あとから直せます</span></div>';
  $('leagueBox').innerHTML = h;
}
function applyLeague(){
  const gs = leagueGroups(), rounds = lgRounds();
  if(!gs.length) return;
  if(!confirm(rounds + '周の総当たりを設定します。\n・各チームの希望本数を「（人数−1）×' + rounds + '」にそろえます\n' +
    '・全カードを「必ず当てる」にします\n・同じカードの上限を' + rounds + '回にします\nよろしいですか？')) return;
  PAIROV = {};
  const rows = [...$('teamBody').querySelectorAll('tr')];
  gs.forEach(g => {
    const ps = leaguePairs(g);
    ps.forEach(p => PAIROV[povk(p[0],p[1])] = (rounds > 1 ? 'want2' : 'want'));
    g.teams.forEach(t => {
      const n = ps.filter(p => p[0].id === t.id || p[1].id === t.id).length * rounds;
      if(rows[t.id]) rows[t.id].querySelector('.t-tgt').value = n;
    });
  });
  $('cfgSame').value = String(rounds);
  refreshHint(); drawLeague();
  alert('設定しました。「スケジュールを作る」を押してください。');
}
/* 星取表：どのカードが組めて、どれが残っているか */
function leagueTable(r){
  const gs = leagueGroups();
  const wants = Object.keys(PAIROV).filter(k => isWant(PAIROV[k]));
  if(!wants.length || !gs.length) return '';
  /* 1組に複数の試合が入ることがある（2周）ので、時刻を配列で持つ */
  const done = {};
  r.asg.forEach((m,i) => {if(m){const k = povk(m.a,m.b); (done[k] = done[k] || []).push(toHM(r.cells[i].start));}});
  let h = '';
  gs.forEach(g => {
    const ps = leaguePairs(g).filter(p => isWant(PAIROV[povk(p[0],p[1])]));
    if(!ps.length) return;
    const need = p => wantN(PAIROV[povk(p[0],p[1])]);
    const got = p => (done[povk(p[0],p[1])] || []).length;
    const needTotal = ps.reduce((a,p) => a + need(p), 0);
    const gotTotal = ps.reduce((a,p) => a + Math.min(got(p), need(p)), 0);
    h += '<div class="vname">' + esc(g.name) + ' の対戦表<span>' +
      gotTotal + ' / ' + needTotal + '試合が入りました</span></div>';
    h += '<div class="scroll"><table class="tbl"><thead><tr><th></th>' +
      g.teams.map(t => '<th style="font-size:11px">' + esc(t.name) + '</th>').join('') + '</tr></thead><tbody>';
    g.teams.forEach(a => {
      h += '<tr><th style="text-align:left;white-space:nowrap">' + esc(a.name) + '</th>';
      g.teams.forEach(b => {
        if(a.id === b.id){h += '<td style="background:#EFEFEC"></td>';return;}
        const k = povk(a,b);
        if(!isWant(PAIROV[k])){h += '<td style="color:#B6BEB8;text-align:center">—</td>';return;}
        const n = wantN(PAIROV[k]), ts = (done[k] || []).sort();
        h += ts.length >= n
          ? '<td style="text-align:center;font-family:var(--mono);font-size:12px;background:#EFF6F1;color:#1D6F4A">' + ts.join('<br>') + '</td>'
          : '<td style="text-align:center;background:#FBEDE9;color:#A33520;font-size:11px">' +
            (ts.length ? '<span style="font-family:var(--mono)">' + ts.join('<br>') + '</span><br>あと' + (n - ts.length) + '本' : '未') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  return h;
}

/* ---------- 大会要項 ----------
   「25分ハーフ」「次の試合まで15分」のような現場の言い方から、
   面の設定（試合時間・開始間隔）を計算して入れる */
const HALVES = [15,20,25,30,35,40];
const GAPS = [10,15,20,25,30,45,60];
const REFMODES = [{v:0,label:'なし'},{v:1,label:'主審のみ'},{v:3,label:'主審＋副審2'},{v:4,label:'4人制'}];
let FMHALF = 25, FMGAP = 15, REFMODE = 3;
function fmMatchMin(){return FMHALF*2 + (+$('fmHT').value || 0);}
function fmSetVenue(v){
  const r = venueRows()[0];
  if(r){r.querySelector('.v-name').value = v; syncVenues();}
  autoSave();
}
function drawFormat(){
  $('fmHalf').innerHTML = HALVES.map(h => '<button class="chip' + (FMHALF === h ? ' on' : '') +
    '" onclick="FMHALF=' + h + ';drawFormat()">' + h + '分</button>').join('');
  $('fmGap').innerHTML = GAPS.map(g => '<button class="chip' + (FMGAP === g ? ' on' : '') +
    '" onclick="FMGAP=' + g + ';drawFormat()">' + g + '分</button>').join('');
  $('fmRef').innerHTML = REFMODES.map(m => '<button class="chip' + (REFMODE === m.v ? ' on' : '') +
    '" onclick="REFMODE=' + m.v + ';drawFormat()">' + m.label + '</button>').join('');
  const mm = fmMatchMin(), iv = mm + FMGAP, ko = toMin($('fmKO').value) || 540;
  const n = 8;
  const list = [];
  for(let i=0;i<n;i++) list.push(toHM(ko + iv*i));
  $('fmCalc').innerHTML = '<b>1試合 ' + mm + '分</b>（' + FMHALF + '分ハーフ＋ハーフタイム' + (+$('fmHT').value||0) + '分）／' +
    '<b>' + iv + '分まわし</b>（次の試合まで' + FMGAP + '分）<br>' +
    '<span style="font-family:var(--mono);font-size:12px">KO ' + list.join('　') + ' …</span>';
  if($('fmVenue') && !$('fmVenue').value){const v = readVenues()[0]; if(v) $('fmVenue').value = v.name;}
}
function applyFormat(){
  const mm = fmMatchMin(), iv = mm + FMGAP, ko = $('fmKO').value;
  const rows = [...$('courtBody').querySelectorAll('tr')];
  if(!rows.length){alert('先に面（コート）を1つ以上つくってください');return;}
  rows.forEach(tr => {
    tr.querySelector('.c-from').value = ko;
    tr.querySelector('.c-match').value = mm;
    tr.querySelector('.c-int').value = iv;
  });
  if($('fmVenue') && $('fmVenue').value && venueRows().length <= 1) fmSetVenue($('fmVenue').value);
  refreshHint();
  const w = defaultWindow();
  $('fmHint').textContent = '面を ' + ko + '〜 / 1試合' + mm + '分 / ' + iv + '分まわし にしました（チームの時間は ' + w.from + '〜' + w.to + '）';
  fitAllTeamTimes();
  drawFormat();
}
/* 確認なしで全チームの時間をそろえる（要項作成の流れの中で使う） */
function fitAllTeamTimes(){
  const w = defaultWindow();
  [...$('teamBody').querySelectorAll('tr')].forEach(tr => {
    tr.querySelector('.t-from').value = w.from; tr.querySelector('.t-to').value = w.to;
  });
  refreshHint();
}

/* ---------- 審判割 ----------
   その時間に試合をしていないチームから、担当回数の少ない順に割り当てる */
const REFROLES = ['主審','副審1','副審2','4審'];
let REF = {};
function assignRefs(r,teams){
  REF = {};
  if(!REFMODE) return;
  const count = {};
  teams.forEach(t => count[t.id] = 0);
  const order = r.asg.map((m,i) => i).filter(i => r.asg[i]).sort((a,b) => r.cells[a].start - r.cells[b].start || a - b);
  order.forEach(idx => {
    const cell = r.cells[idx], m = r.asg[idx];
    /* その時間に出ていない、かつ会場にいるはずのチーム */
    const busy = {};
    r.asg.forEach((x,k) => {
      if(!x) return;
      const c = r.cells[k];
      if(c.start < cell.end && cell.start < c.end){busy[x.a.id] = 1; busy[x.b.id] = 1;}
    });
    const cand = teams.filter(t => !busy[t.id] && t.from <= cell.start && cell.start <= t.to);
    cand.sort((x,y) => count[x.id] - count[y.id] || x.id - y.id);
    const pick = cand.slice(0, REFMODE);
    REF[idx] = pick.map(t => t.id);
    pick.forEach(t => count[t.id]++);
  });
}
function refNames(idx){
  if(!REFMODE || !REF[idx] || !REF[idx].length) return '';
  return REF[idx].map((id,i) => {
    const t = ALL.teams.filter(x => x.id === id)[0];
    return (REFMODE > 1 ? REFROLES[i] + ' ' : '') + (t ? t.name : '—');
  }).join('／');
}
/* その時間に試合をしているチームが審判に入っていないか */
function refBad(idx){
  const r = ALL.plans[SEL].r, cell = r.cells[idx], bad = [];
  (REF[idx] || []).forEach(id => {
    if(id == null) return;
    const playing = r.asg.some((m,k) => m && (m.a.id === id || m.b.id === id) &&
      r.cells[k].start < cell.end && cell.start < r.cells[k].end);
    if(playing){const t = ALL.teams.filter(x => x.id === id)[0]; bad.push(t ? t.name : '');}
  });
  return bad;
}
function refHTML(idx){
  if(!REFMODE) return '';
  const got = (REF[idx] || []).filter(x => x != null).length;
  const s = refNames(idx), bad = refBad(idx);
  let tail = '';
  if(got === 0) tail = '<span style="color:var(--warn)">出せるチームがいません</span>';
  else if(got < REFMODE) tail = esc(s) + '<span style="color:var(--mid)">／' + REFROLES.slice(got, REFMODE).join('・') + ' なし</span>';
  else tail = esc(s);
  if(bad.length) tail += '<span style="color:var(--warn)">（' + esc(bad.join('・')) + ' はこの時間に試合中）</span>';
  return '<button class="refline" onclick="' + stop + 'openRef(' + idx + ')" title="押すと審判を変えられます">' +
    '<span class="rlab">審判</span><span>' + tail + '</span><span class="rmark noprint">変更 ▾</span></button>';
}
let REFCELL = null;
function openRef(idx){REFCELL = (REFCELL === idx ? null : idx); render();}
function setRef(idx,i,val){
  REF[idx] = REF[idx] || [];
  REF[idx][i] = val === '' ? null : +val;
  render();
}
function refFormHTML(idx){
  const cell = ALL.plans[SEL].r.cells[idx];
  let h = '<div class="addbox">';
  for(let i=0;i<REFMODE;i++){
    const cur = (REF[idx] || [])[i];
    h += '<span class="ni">' + REFROLES[i] +
      ' <select onchange="setRef(' + idx + ',' + i + ',this.value)"><option value="">－</option>' +
      ALL.teams.map(t => {
        const playing = ALL.plans[SEL].r.asg.some((m,k) => m && (m.a.id === t.id || m.b.id === t.id) &&
          ALL.plans[SEL].r.cells[k].start < cell.end && cell.start < ALL.plans[SEL].r.cells[k].end);
        return '<option value="' + t.id + '"' + (cur === t.id ? ' selected' : '') + '>' +
          esc(t.name) + (playing ? '（この時間は試合中）' : '') + '</option>';
      }).join('') + '</select></span>';
  }
  h += '<button onclick="' + stop + 'openRef(' + idx + ')">閉じる</button></div>';
  return h;
}
/* 審判の担当回数（偏りの確認用） */
function refCounts(){
  const c = {};
  ALL.teams.forEach(t => c[t.id] = 0);
  Object.keys(REF).forEach(k => (REF[k] || []).forEach(id => {if(c[id] !== undefined) c[id]++;}));
  return c;
}

/* ---------- 組む前のチェック ---------- */
function gather(){
  const teams = readTeams(), courts = readCourts();
  const cfg = {maxCat:+$('cfgCat').value, back:$('cfgBack').value, maxSame:+$('cfgSame').value,
    format:+$('cfgFormat').value, club:$('cfgClub').value, rank:$('cfgRank').value,
    mix:+$('cfgMix').value};
  return {teams:teams, courts:courts, cfg:cfg, cells:makeCells(courts)};
}
const availFn = courts => (t,cell) => inWindow(t,cell) && fitsCourt(t,courts[cell.ci]);
const allowedFn = cfg => (a,b) => pairState(a,b,{maxCat:cfg.maxCat, club:cfg.club, rank:cfg.rank}).allowed;
/* 実際に何本まで組めるかを測る。相手側の希望本数も埋まるので、机上の計算では出せない。
   本数を詰めることだけを狙った重みで数回まわし、チームごとの最大値を採る */
let ESTCACHE = null;
function estimateBest(teams,courts,cells,cfg){
  const key = JSON.stringify([teams.map(t => [t.id,t.target,t.from,t.to,t.catRaw,t.club,t.rank,t.dual]),
    courts.map(c => [c.ci,c.from,c.to,c.match,c.interval,c.cats,c.venueId]), cfg.maxCat, cfg.club, cfg.rank, cfg.maxSame, cfg.back,
    Object.keys(PAIROV).sort()]);
  if(ESTCACHE && ESTCACHE.key === key) return ESTCACHE.val;
  const per = {}, ovm = teams.map(a => teams.map(b => povGet(a,b)));
  const catM = teams.map(a => teams.map(b => catOK(a,b,cfg.maxCat)));
  teams.forEach(t => per[t.id] = 0);
  let best = 0, minBtb = Infinity;
  const c2 = Object.assign({}, cfg, {ov:ovm, catM:catM, back:'free'});
  const ref = Math.min.apply(null, courts.map(c => c.interval));
  /* 本数を最大にする狙いと、連戦を最小にする狙いの2通りで回し、
     それぞれ「実際に到達できた水準」を基準値として持ち帰る */
  [{cat:0, rep:0, club:0, back:0,  move:0, noise:3},
   {cat:0, rep:0, club:0, back:80, move:0, noise:3}].forEach((w,pass) => {
    for(let k=0;k<18;k++){
      const r = build(teams,courts,cells,c2,90001 + pass*7717 + k*613,w);
      teams.forEach(t => {if(r.played[t.id] > per[t.id]) per[t.id] = r.played[t.id];});
      best = Math.max(best, r.asg.filter(Boolean).length);
      let btb = 0;
      const mine = {};
      teams.forEach(t => mine[t.id] = []);
      r.asg.forEach(m => {if(m){mine[m.a.id].push(m.cell); mine[m.b.id].push(m.cell);}});
      teams.forEach(t => {
        if(t.burst) return;
        const ms = mine[t.id].sort((a,b) => a.start - b.start);
        for(let i=1;i<ms.length;i++) if(ms[i].start - ms[i-1].end < ref) btb++;
      });
      if(r.asg.filter(Boolean).length >= best) minBtb = Math.min(minBtb, btb);
    }
  });
  const val = {perTeam:per, matches:best, minBtb: minBtb === Infinity ? 0 : minBtb};
  ESTCACHE = {key:key, val:val};
  return val;
}
function preCheck(){
  const {teams, courts, cfg, cells} = gather();
  if(teams.length < 2){$('preBox').innerHTML = '<div class="alert">チームを2つ以上入れてください。</div>';return null;}
  if(!cells.length){$('preBox').innerHTML = '<div class="alert">使用時間が短すぎて試合枠が作れません。</div>';return null;}
  const cap = MMScore.capacity({teams:teams, cells:cells, avail:availFn(courts), allowed:allowedFn(cfg),
    estimate:estimateBest(teams,courts,cells,cfg), maxSame:cfg.maxSame,
    limits:staffLimits(teams), clubOf:clubOf});
  let h = '';
  h += '<div class="' + (cap.unavoidable > 0 ? 'alert' : 'ok') + '">' +
    '<b>枠は ' + cap.slotCount + '（' + courts.length + '面）／希望本数の合計 ' + cap.wishTotal + '本 → 必要試合数 ' + Math.ceil(cap.wishTotal/2) + '</b><br>' +
    (cap.wishTotal/2 > cap.slotCount
      ? '枠が足りません。<b>最大 ' + cap.slotCount + '本</b>までしか組めないので、' + (cap.wishTotal - cap.slotCount*2) + '本ぶんは希望に届きません。使用時間を延ばすか、面を増やしてください。'
      : '枠の数は足りています。') +
    (cap.unavoidable > 0 ? '<br>相手の組み合わせの都合で、<b>どう組んでも' + cap.unavoidable + '本ぶんは希望に届きません</b>。' : '') + '</div>';
  const ng = cap.perTeam.filter(x => x.reason);
  if(ng.length){
    /* 助言は理由に合わせて変える。関係のない対処を並べると迷わせるだけ */
    const tips = [];
    const has = s => ng.some(x => x.reason.indexOf(s) >= 0);
    if(has('同じクラブ')) tips.push('そのクラブの<b>「スタッフ〇名」</b>を増やす、または出られる時間を延ばす');
    if(has('時間帯が')) tips.push('<b>初戦KO・最終KO</b>を広げる、または面を増やす');
    if(has('同じカードの上限')) tips.push('<b>同じカードの上限</b>を増やす');
    if(has('相手が1チームもいません') || has('相手側の本数'))
      tips.push('<b>カテゴリー差の許容</b>を広げる、特記で<b>「上の学年ともOK」</b>を付ける、または「対戦してよい組み合わせ」で相手を足す');
    h += '<div class="alert"><b>希望本数に届かないチーム</b><br>' +
      ng.map(x => esc(x.team.name) + '：希望' + x.team.target + '本 → 最大' + x.feasible + '本（' + x.reason + '）').join('<br>') +
      (tips.length ? '<br>→ ' + tips.join('／') + '、で増やせます。' : '') + '</div>';
  }
  if(cap.unavoidable === 0 && cap.wishTotal/2 <= cap.slotCount)
    h += '<div class="ok">このまま組めば全チームの希望を満たせる見込みです。</div>';
  $('preBox').innerHTML = h;
  return cap;
}

/* ---------- 生成 ---------- */
let ALL = null, SEL = 0, SEEDBASE = 0, DIAG = null;
function run(reseed){
  const {teams, courts, cfg, cells} = gather();
  if(teams.length < 2){alert('チームを2つ以上入れてください');return;}
  if(courts.some(c => c.from == null || c.to == null || c.to <= c.from)){alert('面の使用時間を確認してください');return;}
  if(!cells.length){alert('使用時間が短すぎて試合枠が作れません');return;}
  preCheck();
  /* 対戦可否とカテゴリー判定を一度だけ表にしておく（内側ループを速く保つ） */
  cfg.ov = teams.map(a => teams.map(b => povGet(a,b)));
  cfg.catM = teams.map(a => teams.map(b => catOK(a,b,cfg.maxCat)));
  if(reseed) SEEDBASE = Math.floor(Math.random()*900000) + 1;
  const plans = [], sigs = new Set();
  PLANS.forEach(p => {
    const w = Object.assign({}, p.w, {club:(p.w.club || 0)*cfg.mix});
    let best = null;
    for(let k=0;k<220;k++){
      const r = build(teams,courts,cells,cfg,SEEDBASE + k*7919 + 13,w);
      const c = quickCost(r,teams,courts,cfg,w);
      if(!best || c < best.c) best = {r:r, c:c};
    }
    const sig = JSON.stringify(best.r.asg.map(m => m ? pk(m.a,m.b) : '-'));
    if(sigs.has(sig)) return;
    sigs.add(sig);
    /* 重い診断は各案の代表1つにだけかける */
    plans.push({name:p.name, desc:p.desc, r:best.r, d:diagnoseOf(best.r,teams,courts,cfg)});
  });
  let bi = 0;
  plans.forEach((p,i) => {
    const A = p.d, B = plans[bi].d;
    if(A.hard.length !== B.hard.length){if(A.hard.length < B.hard.length) bi = i; return;}
    if(A.totalScore > B.totalScore) bi = i;
  });
  ALL = {plans:plans, cfg:cfg, teams:teams, courts:courts};
  assignRefs(plans[bi].r, teams);
  $('out').style.display = 'block';
  pick(bi);
  $('out').scrollIntoView({behavior:'smooth'});
}
/* 探索中に使う軽いコスト。1回の生成ごとに走るので、重い診断は使わない */
function quickCost(r,teams,courts,cfg,w){
  let miss = 0, rep = 0, btb = 0, catSum = 0, clubHit = 0, rankHit = 0, moves = 0, repClub = 0;
  const pc = {}, ref = Math.min.apply(null, courts.map(c => c.interval));
  const mine = {}, met = {};
  teams.forEach(t => {mine[t.id] = []; met[t.id] = {};});
  r.asg.forEach(m => {
    if(!m) return;
    const k = pk(m.a,m.b); pc[k] = (pc[k]||0) + 1;
    catSum += catDiff(m.a,m.b) || 0;
    if(sameClubP(m.a,m.b)) clubHit++;
    if(m.a.rank && m.b.rank && m.a.rank !== m.b.rank) rankHit++;
    mine[m.a.id].push(m.cell); mine[m.b.id].push(m.cell);
    const oa = clubOf(m.a), ob = clubOf(m.b);
    met[m.a.id][ob] = (met[m.a.id][ob]||0) + 1; met[m.b.id][oa] = (met[m.b.id][oa]||0) + 1;
  });
  Object.values(pc).forEach(v => {if(v > 1) rep += v - 1;});
  teams.forEach(t => {
    miss += Math.max(0, t.target - r.played[t.id]);
    Object.values(met[t.id]).forEach(v => {if(v > 1) repClub += v - 1;});
    const ms = mine[t.id].sort((a,b) => a.start - b.start);
    for(let i=1;i<ms.length;i++){
      if(!t.burst && ms[i].start - ms[i-1].end < ref) btb++;
      if(courts[ms[i].ci].venueId !== courts[ms[i-1].ci].venueId) moves++;
    }
  });
  return miss*1000 + btb*Math.max(w.back,1) + rep*w.rep + repClub*(w.club||0) +
    catSum*w.cat + moves*(w.move||0) + clubHit*600 + rankHit*400;
}
function diagnoseOf(r,teams,courts,cfg){
  const vname = {};
  courts.forEach(c => vname[c.ci] = c.venueName);
  return MMScore.diagnose({
    teams:teams, courts:courts, cells:r.cells, asg:r.asg, cfg:cfg, template:TPL,
    avail:availFn(courts), allowed:allowedFn(cfg),
    estimate:estimateBest(teams,courts,r.cells,cfg),
    travel:(a,b) => {
      const va = courts.filter(c => c.venueName === a)[0], vb = courts.filter(c => c.venueName === b)[0];
      return va && vb ? travelMin(va.venueId, vb.venueId) : 0;
    },
    venueOf:cell => vname[cell.ci],
    catDiff:catDiff, catOK:catOK, sameClub:sameClubP, orgOf:clubOf,
    clubOf:clubOf, staffLimits:staffLimits,
    wants:Object.keys(PAIROV).filter(k => isWant(PAIROV[k])).map(k => {
      const p = JSON.parse(k); return [p[0], p[1], wantN(PAIROV[k])];}),
    explicitOk:(a,b) => povGet(a,b)
  });
}
function pick(i){
  SEL = i; SELCELL = null; ADDCELL = null; EDITSLOT = null; REFCELL = null;
  /* 案が変わればカードも変わるので審判を割り当て直す。
     手で直した審判は、案を変えない限りそのまま残る */
  assignRefs(ALL.plans[i].r, ALL.teams);
  $('planbar').innerHTML =
    ALL.plans.map((x,k) => '<button class="pbtn' + (k === i ? ' on' : '') + '" onclick="pick(' + k + ')" title="' + esc(x.desc) + '">' + esc(x.name) + '</button>').join('') +
    '<button class="pbtn re" onclick="run(true)">↻ 別パターン</button>' +
    (REFMODE ? '<button class="pbtn" onclick="reassignRefs()">審判を割り当て直す</button>' : '');
  render();
}
function reassignRefs(){assignRefs(ALL.plans[SEL].r, ALL.teams); render();}
function recount(){
  const p = ALL.plans[SEL], r = p.r;
  ALL.teams.forEach(t => r.played[t.id] = 0);
  r.asg.forEach(m => {if(m){r.played[m.a.id]++; r.played[m.b.id]++;}});
  p.d = diagnoseOf(r, ALL.teams, ALL.courts, ALL.cfg);
}

/* ---------- 診断の表示 ---------- */
function drawDiag(d){
  let h = '';
  if(d.blocked){
    h += '<div class="blocked"><b>このままでは公開できません（' + d.hard.length + '件）</b>' +
      '当日に成立しない配置が含まれています。下の指摘を押すと該当の試合に移動します。</div>';
  }else{
    h += '<div class="scoreTop"><div class="lead">' + d.matches + '件を配置しました' +
      (d.worst ? '　いちばん低いのは<b>' + esc(d.worst.label) + ' ' + d.worst.score + '点</b>' : '') + '</div>' +
      '<div class="total"><span class="cap">総合スコア</span><b style="color:' +
      (d.level === 'ok' ? 'var(--ok)' : d.level === 'warn' ? 'var(--mid)' : 'var(--warn)') + '">' +
      d.totalScore + '</b><i>点</i></div></div>';
  }
  h += '<div class="mcards">' + d.metrics.map(m =>
    '<div class="mcard lv-' + m.level + '"><div class="lb">' + esc(m.label) + '</div>' +
    '<div class="v">' + m.score + '</div><div class="sm">' + esc(m.summary) + '</div>' +
    '<div class="wt">重み ' + m.weight + '</div></div>').join('') + '</div>';
  const list = d.hard.concat(d.issues);
  if(list.length){
    /* 試合に紐づく指摘だけ押せるようにする（押しても何も起きないボタンを作らない） */
    h += '<div class="issues">' + list.map(x => {
      const body = '<span class="lv ' + x.level + '">' + (x.level === 'error' ? '要修正' : '注意') + '</span>' +
        '<span class="tx"><b>' + esc(x.title) + '</b><span>' + esc(x.detail || '') + '</span></span>';
      return x.idx === undefined
        ? '<div class="issue" style="cursor:default">' + body + '</div>'
        : '<button class="issue" onclick="jumpTo(' + x.idx + ')" title="この試合に移動します">' + body +
          '<span style="margin-left:auto;color:var(--dim);font-size:12px">表へ →</span></button>';
    }).join('') + '</div>';
  }
  $('diag').innerHTML = h;
}
function jumpTo(idx){
  if(idx < 0) return;
  const td = document.querySelector('.sched td[data-i="' + idx + '"]');
  if(!td) return;
  document.querySelectorAll('.sched td.hit').forEach(x => x.classList.remove('hit'));
  td.classList.add('hit');
  td.scrollIntoView({behavior:'smooth', block:'center'});
}

/* ---------- 進行表 ---------- */
let SELCELL = null, ADDCELL = null, ADDA = '', ADDB = '', EDITSLOT = null, NO = {};
function render(){
  const p = ALL.plans[SEL], r = p.r, courts = ALL.courts, teams = ALL.teams;
  const d = p.d;
  drawDiag(d);
  const dt = $('cfgDate').value, ds = dt ? (+dt.slice(5,7)) + '月' + (+dt.slice(8,10)) + '日 ' : '';
  const vs = readVenues();
  const open = $('cfgOpen') ? $('cfgOpen').value : '';
  const ko = Math.min.apply(null, courts.map(c => c.from));
  $('head').innerHTML = '<div style="font-size:19px;font-weight:800">' + ds + esc($('cfgTitle').value) + '</div>' +
    '<div style="font-size:13px;margin-top:6px">' +
    '<b>会場</b> ' + vs.map(v => esc(v.name)).join('・') +
    (open ? '　<b>開門</b> ' + esc(open) : '') + '　<b>1試合目KO</b> ' + toHM(ko) + '</div>' +
    '<div style="color:var(--dim);font-size:12.5px;margin-top:4px">' +
    courts.map(c => '<b>' + esc(c.venueName) + ' ' + esc(c.name) + '</b> ' + toHM(c.from) + '〜' + toHM(c.to) +
      '／1試合' + c.match + '分・' + c.interval + '分まわし' + (c.cats ? '（' + esc(c.cats) + '）' : '')).join('<br>') + '</div>';

  NO = {}; let n = 0;
  r.asg.forEach((m,idx) => {if(m){n++; NO[idx] = n;}});

  /* 会場ごとに表を分ける */
  let h = '';
  vs.forEach(v => {
    const cs = courts.filter(c => c.venueId === v.id);
    if(!cs.length) return;
    h += '<div class="vname">' + esc(v.name) + '<span>' + cs.length + '面</span></div>';
    const starts = [...new Set(r.cells.filter(c => cs.some(x => x.ci === c.ci)).map(c => c.start))].sort((a,b) => a - b);
    h += '<div class="scroll"><table class="sched"><thead><tr><th style="width:112px">時間</th>' +
      cs.map(c => '<th>' + esc(c.name) + '</th>').join('') + '</tr></thead><tbody>';
    starts.forEach(st => {
      h += '<tr><td class="time">' + toHM(st) + '</td>';
      cs.forEach(c => {
        const idx = r.cells.findIndex(x => x.ci === c.ci && x.start === st);
        if(idx < 0){h += '<td class="blank">－</td>';return;}
        h += cellHTML(r.asg[idx], idx, courts, r.cells[idx]);
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  });
  $('tables').innerHTML = h;

  /* 参加チーム一覧 */
  const multi = vs.length > 1;
  let pt = '<div class="vname">参加チームと出場予定</div><div class="scroll"><table class="tbl"><thead><tr>' +
    '<th>チーム</th><th>カテゴリー</th><th>人数</th><th>本数</th><th title="対戦する相手クラブの数">相手</th><th>出場時刻（対戦相手）</th></tr></thead><tbody>';
  teams.forEach(t => {
    const ms = [], oc = {};
    r.asg.forEach((m,i) => {
      if(!m || (m.a.id !== t.id && m.b.id !== t.id)) return;
      const o = m.a.id === t.id ? m.b : m.a;
      ms.push({s:r.cells[i].start, c:courts[r.cells[i].ci], o:o.name});
      oc[clubOf(o)] = 1;
    });
    ms.sort((a,b) => a.s - b.s);
    const nc = Object.keys(oc).length;
    pt += '<tr><td style="white-space:nowrap;font-weight:700">' + esc(t.name) + '</td><td>' + esc(t.catRaw) + '</td>' +
      '<td>' + t.players + '</td><td>' + ms.length + '本</td><td>' + (nc ? nc + 'クラブ' : '—') + '</td><td style="font-size:12.5px">' +
      (ms.length ? ms.map(x => '<b style="font-family:var(--mono)">' + toHM(x.s) + '</b>' + (multi ? '[' + esc(x.c.venueName) + ']' : '') + esc(x.o)).join('　／　') : '—') +
      '</td></tr>';
  });
  $('pteams').innerHTML = pt + '</tbody></table></div>' + leagueTable(r);
  drawGantt(r, courts, teams);
  const note = $('cfgNote').value.trim();
  /* チームごとの「その他」は生成に効かないので、必ず紙に出す */
  const tn = teams.filter(t => t.note).map(t => esc(t.name) + '：' + esc(t.note));
  /* 審判の担当回数（偏りの確認用） */
  let rc = '';
  if(REFMODE){
    const c = refCounts();
    rc = '<div class="vname">審判の担当回数</div><p style="font-size:13px">' +
      teams.map(t => esc(t.name) + ' <b>' + c[t.id] + '回</b>').join('　／　') + '</p>';
  }
  /* 会場注意事項 */
  const notes = [['開門時間について', $('cfgOpenNote')], ['駐車場について', $('cfgParkNote')], ['その他', $('cfgOtherNote')]]
    .filter(x => x[1] && x[1].value.trim());
  const nh = notes.length ? '<div class="vname">会場からのお願い</div>' +
    notes.map(x => '<p style="font-size:13px;margin:4px 0"><b>' + x[0] + '</b><br>' + esc(x[1].value.trim()).replace(/\n/g,'<br>') + '</p>').join('') : '';
  $('pnote').innerHTML = rc + nh +
    (note ? '<div class="ok" style="margin-top:12px">' + esc(note).replace(/／/g,'<br>') + '</div>' : '') +
    (tn.length ? '<div class="ok" style="margin-top:12px"><b>チームからの連絡</b><br>' + tn.join('<br>') + '</div>' : '');
}
/* ---------- チーム別タイムライン ----------
   1日の過ごし方を1本の帯で見せる。白い部分＝出られない時間、
   色の付いた四角＝試合、斜線＝次の試合までの空き（分を表示） */
const CCOL = ['#1D6F4A','#2E6F9E','#8A5A2B','#7A4F8F','#B0562A','#3C7F6E'];
function drawGantt(r,courts,teams){
  if(!$('gantt')) return;
  const t0 = Math.min.apply(null, courts.map(c => c.from));
  const t1 = Math.max.apply(null, courts.map(c => c.to));
  const span = Math.max(1, t1 - t0);
  const pct = m => (m - t0) / span * 100;
  let g = '';
  teams.forEach(t => {
    let b = '';
    /* 出られない時間を白でふさぐ */
    if(t.from > t0) b += '<div class="gwin" style="left:0;width:' + pct(Math.min(t.from,t1)) + '%"></div>';
    const leave = t.to + Math.max.apply(null, courts.map(c => c.match));
    if(leave < t1) b += '<div class="gwin" style="left:' + pct(Math.max(leave,t0)) + '%;right:0"></div>';
    /* 試合 */
    const ms = [];
    r.asg.forEach(m => {
      if(!m || (m.a.id !== t.id && m.b.id !== t.id)) return;
      ms.push(m);
    });
    ms.sort((x,y) => x.cell.start - y.cell.start);
    /* 試合と試合のあいだ（空き時間）。30分以上あるものだけ数字を出す */
    for(let i=1;i<ms.length;i++){
      const gapS = ms[i-1].cell.end, gapE = ms[i].cell.start, len = gapE - gapS;
      if(len <= 0) continue;
      b += '<div class="ggap" style="left:' + pct(gapS) + '%;width:' + (len/span*100) + '%">' +
        (len >= 30 ? '<b>' + (len >= 60 ? Math.floor(len/60) + '時間' + (len%60 ? len%60 + '分' : '') : len + '分') + '</b>' : '') +
        '</div>';
    }
    ms.forEach(m => {
      const o = m.a.id === t.id ? m.b : m.a, c = courts[m.cell.ci];
      b += '<div class="gblk" style="left:' + pct(m.cell.start) + '%;width:' + ((m.cell.end - m.cell.start)/span*100) +
        '%;background:' + CCOL[c.ci % CCOL.length] + '" title="' + toHM(m.cell.start) + ' ' +
        esc(c.venueName) + ' ' + esc(c.name) + ' vs ' + esc(o.name) + '">' + toHM(m.cell.start) + '</div>';
    });
    g += '<div class="gname">' + (t.home ? '<span class="ptag yes">自</span> ' : '') + esc(t.name) +
      '<span style="color:var(--dim);font-weight:400;font-size:11px"> ' + ms.length + '本</span></div>' +
      '<div class="gtrack">' + b + '</div>';
  });
  $('gantt').innerHTML = g;
  $('axis').innerHTML = '<span>' + toHM(t0) + '</span><span>' + toHM(t0 + Math.round(span/2)) + '</span><span>' + toHM(t1) + '</span>';
  $('legend').innerHTML = courts.map(c => '<span><i style="background:' + CCOL[c.ci % CCOL.length] + '"></i>' +
    esc(c.venueName) + ' ' + esc(c.name) + '</span>').join('') +
    '<span><i style="background:#fff;border:1px solid var(--line)"></i>出られない時間</span>' +
    '<span><i style="background:#F7E9C4"></i>試合の間の空き</span>';
}

const stop = 'event.stopPropagation();';
const swapAttrs = i => ' data-i="' + i + '" draggable="true"' +
  ' ondragstart="dragStart(event,' + i + ')" ondragover="dragOver(event,' + i + ')"' +
  ' ondragleave="dragOut(event)" ondrop="dropOn(event,' + i + ')" onclick="tapSwap(' + i + ')"';
function cellHTML(m,idx,courts,cell){
  const bad = badOf(idx);
  const flag = bad ? '<span class="flag" title="' + esc(bad) + '">!</span>' : '';
  if(ADDCELL === idx) return '<td class="card">' + addFormHTML(idx,courts,cell) + '</td>';
  if(EDITSLOT && EDITSLOT.idx === idx && m) return '<td class="card"><span class="n">' + NO[idx] + '</span>' + slotFormHTML(m,idx,courts,cell) + '</td>';
  if(!m) return '<td class="blank"' + swapAttrs(idx) + '>（空き）' +
    '<button class="addbtn" onclick="' + stop + 'addAt(' + idx + ')">＋ 試合を入れる</button></td>';
  const nm = (w,t) => '<button class="tname" onclick="' + stop + 'editSlot(' + idx + ',\'' + w + '\')" title="押すと他のチームに変えられます">' + esc(t.name) + '</button>';
  const ref = REFCELL === idx ? refFormHTML(idx) : refHTML(idx);
  return '<td class="card"' + swapAttrs(idx) + '><span class="n">' + NO[idx] + '</span>' +
    nm('a',m.a) + '<span class="vs">vs</span>' + nm('b',m.b) + flag + ref + '</td>';
}
function badOf(idx){
  const d = ALL.plans[SEL].d;
  const hit = d.hard.concat(d.issues).filter(x => x.idx === idx);
  return hit.length ? hit.map(x => x.title).join(' / ') : '';
}
/* 入れ替え */
function swapCells(i,j){
  const r = ALL.plans[SEL].r, a = r.asg[i], b = r.asg[j];
  r.asg[i] = b ? {a:b.a, b:b.b, cell:r.cells[i]} : null;
  r.asg[j] = a ? {a:a.a, b:a.b, cell:r.cells[j]} : null;
  recount(); render();
}
function tapSwap(i){
  if(SELCELL === null){SELCELL = i; markPick(); return;}
  if(SELCELL === i){SELCELL = null; markPick(); return;}
  const a = SELCELL; SELCELL = null; swapCells(a,i);
}
function markPick(){document.querySelectorAll('.sched td[data-i]').forEach(td => td.classList.toggle('pick', +td.dataset.i === SELCELL));}
function dragStart(e,i){SELCELL = null; markPick(); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move';}
function dragOver(e,i){e.preventDefault();}
function dragOut(e){}
function dropOn(e,i){e.preventDefault(); const j = parseInt(e.dataTransfer.getData('text/plain'),10); if(!isNaN(j) && j !== i) swapCells(j,i);}
/* 空き枠に入れる／チーム名で差し替える */
function addFree(t,cell,court,r,idx){
  if(!inWindow(t,cell) || !fitsCourt(t,court)) return '';
  let n = 0, mine = [];
  r.asg.forEach((m,k) => {
    if(!m || k === idx) return;
    if(m.a.id !== t.id && m.b.id !== t.id) return;
    const c = r.cells[k];
    mine.push(c);
    if(c.start < cell.end && cell.start < c.end) n++;
  });
  if(n >= (t.dual ? 2 : 1)) return '';
  if(!travelOK(mine,cell,ALL.courts)) return '';
  return 'ok';
}
function addWhy(t,cell,court,r,idx){
  if(!inWindow(t,cell)) return 'KO可能時間の外';
  if(!fitsCourt(t,court)) return 'この面の対象カテゴリー外';
  const mine = [];
  r.asg.forEach((m,k) => {if(m && k !== idx && (m.a.id === t.id || m.b.id === t.id)) mine.push(r.cells[k]);});
  if(!travelOK(mine,cell,ALL.courts)) return '会場の移動が間に合わない';
  return 'この時間はすでに出場';
}
function slotOptions(idx,cell,court,curId,other,head){
  const r = ALL.plans[SEL].r, cfg = pairCfg(), okL = [], ngL = [];
  const left = t => Math.max(0, t.target - r.played[t.id]);
  const label = t => esc(t.name) + '（' + r.played[t.id] + '/' + t.target + '本' + (left(t) ? '・あと' + left(t) : '') + '）';
  ALL.teams.forEach(t => {
    if(other && t.id === other.id) return;
    const o = '<option value="' + t.id + '"' + (String(t.id) === String(curId) ? ' selected' : '') + '>';
    if(!addFree(t,cell,court,r,idx)){ngL.push(o + label(t) + ' … ' + addWhy(t,cell,court,r,idx) + '</option>');return;}
    const b = other ? pairWhy(other,t,cfg) : '';
    if(b) ngL.push(o + label(t) + ' … ' + b + '</option>'); else okL.push(o + label(t) + '</option>');
  });
  return head + (okL.length ? '<optgroup label="この時間に出せる">' + okL.join('') + '</optgroup>' : '') +
    (ngL.length ? '<optgroup label="ふつうは組まない">' + ngL.join('') + '</optgroup>' : '');
}
function addAt(idx){ADDCELL = idx; ADDA = ''; ADDB = ''; EDITSLOT = null; render();}
function addCancel(){ADDCELL = null; render();}
function addSel(w,v){if(w === 'a') ADDA = v; else ADDB = v; render();}
function addDo(idx){
  const r = ALL.plans[SEL].r;
  const a = ALL.teams.filter(t => String(t.id) === ADDA)[0], b = ALL.teams.filter(t => String(t.id) === ADDB)[0];
  if(!a || !b || a.id === b.id) return;
  r.asg[idx] = {a:a, b:b, cell:r.cells[idx]};
  ADDCELL = null; recount(); render();
}
function addFormHTML(idx,courts,cell){
  const court = courts[cell.ci], sel = ALL.teams.filter(t => String(t.id) === ADDA)[0];
  const mk = (w,cur,other) => '<select onchange="addSel(\'' + w + '\',this.value)">' +
    slotOptions(idx,cell,court,cur,other,'<option value="">' + (w === 'a' ? 'チームを選ぶ' : '相手を選ぶ') + '</option>') + '</select>';
  return '<div class="addbox">' + mk('a',ADDA,null) + '<span class="vs">vs</span>' +
    (ADDA ? mk('b',ADDB,sel) : '<select disabled><option>先にチームを選ぶ</option></select>') +
    '<button class="go" onclick="' + stop + 'addDo(' + idx + ')"' + (ADDA && ADDB ? '' : ' disabled') + '>入れる</button>' +
    '<button onclick="' + stop + 'addCancel()">やめる</button></div>';
}
function editSlot(idx,which){EDITSLOT = {idx:idx, which:which}; ADDCELL = null; render();}
function editSlotCancel(){EDITSLOT = null; render();}
function setSlot(idx,which,val){
  const r = ALL.plans[SEL].r, cur = r.asg[idx];
  let a = cur ? cur.a : null, b = cur ? cur.b : null;
  const t = val === '' ? null : ALL.teams.filter(x => x.id === +val)[0];
  if(which === 'a') a = t; else b = t;
  r.asg[idx] = (a && b) ? {a:a, b:b, cell:r.cells[idx]} : null;
  EDITSLOT = null; recount(); render();
}
function slotFormHTML(m,idx,courts,cell){
  const court = courts[cell.ci], w = EDITSLOT.which;
  const cur = w === 'a' ? m.a : m.b, other = w === 'a' ? m.b : m.a;
  const sl = '<select onchange="setSlot(' + idx + ',\'' + w + '\',this.value)">' +
    slotOptions(idx,cell,court,cur.id,other,'') + '<option value="">－ この枠を空きにする</option></select>';
  const fixed = '<button class="tname" onclick="' + stop + 'editSlot(' + idx + ',\'' + (w === 'a' ? 'b' : 'a') + '\')">' + esc(other.name) + '</button>';
  return '<div class="addbox">' + (w === 'a' ? sl + '<span class="vs">vs</span>' + fixed : fixed + '<span class="vs">vs</span>' + sl) +
    '<button onclick="' + stop + 'editSlotCancel()">やめる</button></div>';
}

/* ---------- 出力・保存 ---------- */
function textOut(){
  const r = ALL.plans[SEL].r, courts = ALL.courts;
  const order = r.cells.map((c,i) => i).sort((a,b) => r.cells[a].start - r.cells[b].start || r.cells[a].ci - r.cells[b].ci);
  const d = $('cfgDate').value, ds = d ? (+d.slice(5,7)) + '月' + (+d.slice(8,10)) + '日 ' : '';
  let s = ds + $('cfgTitle').value + '\n';
  order.forEach(i => {
    const m = r.asg[i]; if(!m) return;
    const c = courts[r.cells[i].ci];
    s += toHM(r.cells[i].start) + ' [' + c.venueName + ' ' + c.name + '] ' + m.a.name + ' vs ' + m.b.name + '\n';
  });
  return s;
}
function copyText(){
  const t = textOut();
  navigator.clipboard.writeText(t).then(() => alert('コピーしました'), () => prompt('コピーしてください', t));
}
function saveJSON(){
  const o = {studio:1, template:TPL, cfg:{}, venues:readVenues().map(v => v.name), travel:[],
    courts:readCourts().map(c => ({name:c.name, venue:readVenues().findIndex(v => v.id === c.venueId),
      from:c.from, to:c.to, match:c.match, interval:c.interval, cats:c.cats})),
    teams:readTeams(),
    pairs:Object.keys(PAIROV).map(k => {const p = JSON.parse(k); return [p[0],p[1],PAIROV[k]];})};
  ['cfgDate','cfgTitle','cfgNote','cfgFormat','cfgCat','cfgBack','cfgSame','cfgClub','cfgRank','cfgMix','cfgOpen','cfgOpenNote','cfgParkNote','cfgOtherNote'].forEach(k => o.cfg[k] = $(k).value);
  const vs = readVenues();
  Object.keys(TRAVEL).forEach(k => {
    const p = k.split('|');
    const a = vs.filter(v => v.id === p[0])[0], b = vs.filter(v => v.id === p[1])[0];
    if(a && b) o.travel.push([a.name, b.name, TRAVEL[k]]);
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(o,null,1)], {type:'application/json'}));
  a.download = 'matchmake-studio.json'; a.click();
}
function loadJSON(el){
  const f = el.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = function(){
    try{
      const o = JSON.parse(rd.result);
      Object.keys(o.cfg || {}).forEach(k => {if($(k)) $(k).value = o.cfg[k];});
      if(o.template) TPL = o.template;
      /* 1日用ツールのJSONは会場を持たないので、1会場として読む */
      $('venueBody').innerHTML = '';
      const vnames = (o.venues && o.venues.length) ? o.venues : ['会場'];
      vnames.forEach(n => addVenue(n));
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
      /* 新しい項目が無い保存データは既定値で読む（後方互換） */
      (o.teams || []).forEach(t => addTeam({name:t.name, cat:t.catRaw, players:t.players, from:toHM2(t.from), to:toHM2(t.to),
        target:t.target, dual:t.dual, burst:t.burst, home:t.home, club:t.club, rank:t.rank,
        catUp:t.catUp || 0, catDown:t.catDown || 0, staffLimit:t.staffLimit || 0, note:t.note || ''}));
      PAIROV = {};
      /* 対戦可否は3状態。true/false しか無い古いデータもそのまま読める */
      (o.pairs || []).forEach(p => PAIROV[povk(p[0],p[1])] = normWant(p[2]));
      drawTpl(); refreshHint();
      alert('読み込みました' + (o.studio ? '' : '（1日用の設定を1会場として読み込みました）'));
    }catch(e){alert('読み込めませんでした');}
  };
  rd.readAsText(f); el.value = '';
}

/* ---------- 初期化 ---------- */
$('cfgDate').value = new Date(Date.now() - new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
addVenue('第1会場');
addVenue('第2会場');
addCourt({name:'Aコート', venue:0, from:'09:00', to:'16:30', match:50, interval:70, cats:''});
addCourt({name:'Bコート', venue:1, from:'09:00', to:'16:30', match:50, interval:70, cats:''});
[['アラグランデ15','U15',18,'09:00','14:50',4],
 ['パルピターレ15','U15',16,'09:00','14:50',4],
 ['jackclover A','U15',15,'09:00','14:50',3],
 ['アザリー飯田15','U15',16,'10:10','14:50',3],
 ['FCゼアル恵那15','U15',15,'09:00','13:40',3],
 ['アトラソンFC15','U15',14,'09:00','14:50',3]].forEach(d =>
  addTeam({name:d[0], cat:d[1], players:d[2], from:d[3], to:d[4], target:d[5]}));
pickTpl('festival');
drawTpl();
drawFormat();
applyLayout();
