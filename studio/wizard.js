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
  ['cfgDate','cfgTitle','cfgNote','cfgFormat','cfgCat','cfgBack','cfgSame','cfgClub','cfgRank','cfgMix','cfgOpen','cfgOpenNote','cfgParkNote','cfgOtherNote']
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
  (o.pairs || []).forEach(p => PAIROV[povk(p[0],p[1])] = normWant(p[2]));
  drawTpl(); refreshHint(); applyLayout(); drawFormat();
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

/* セットアップの質問（ウィザード）は廃止した。
   同じことを開催情報・大会要項と二重三重に聞いていて、画面がごちゃついたため。
   いまはページそのものが上から順の質問になっている（app.js の applyLayout）。
   ここには自動保存と「前回の続き」だけを残す。 */

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
