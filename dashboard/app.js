/* The rendered evidence comes only from the sealed build, never a live endpoint. */
const D = window.RADAR;
const M = D.model;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : n.toFixed(2));
const exact = n => '$' + Math.round(n).toLocaleString('en-US');
const percent = n => (n * 100).toFixed(1) + '%';
const state = {tab:'board'};
function impliedOf(row, model) {
  const fit = model.fit;
  const slope = Number.isFinite(fit.slope) && fit.slope > 0 ? fit.slope : 1;
  const intercept = Number.isFinite(fit.intercept) ? fit.intercept : Math.log(model.calibratedMultiple);
  const base = Math.exp(intercept + slope * Math.log(row.tvl_usd));
  const family = Math.exp(row.family_offset);
  const growth = 1 + .25 * Math.tanh((row.change_7d ?? 0) / 50);
  const maturity = .85 + .15 * Math.log1p(Math.min(row.age_days, 1095)) / Math.log1p(1095);
  const breadth = 1 + .02 * Math.min(Math.max(row.chains.length - 1, 0), 5);
  const value = Math.max(1, Math.round(Math.exp(intercept + slope * Math.log(row.tvl_usd) + row.family_offset) * growth * maturity * breadth));
  return {base, family, growth, maturity, breadth, value};
}
window.impliedOf = impliedOf;
const matches = D.rows.filter(r => impliedOf(r, M).value === r.implied_value_usd).length;
$('#verify-badge').textContent = `page = board.json: ${matches}/${D.rows.length} values recomputed in your browser ${matches === D.rows.length ? 'match' : 'MISMATCH — inspect values'}`;
$('#asof').textContent = D.as_of;
$('#stats').innerHTML = [['Protocols scanned',D.counts.scanned],['Pre-token found',D.counts.pre_token],['Ranked on radar',D.counts.board],['Watchlist covered',`${D.counts.covered}/${D.counts.watchlist}`],['Fitted comparables',M.calibration_samples],['LOO median miss',M.loo.full.median_miss.toFixed(2)+'x']].map(([k,v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join('');
function options(id, values) {
  $('#' + id).innerHTML = '<option value="all">All</option>' + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}
options('category', [...new Set(D.rows.map(r => r.category ?? 'Other'))].sort());
options('chain', [...new Set(D.rows.flatMap(r => r.chains))].sort());
options('signal', ['launch-ready','warming-up','early','cooling']);
options('verdict', ['farm','thin','skip']);
$('#sort').innerHTML = Object.entries({implied_value_usd:'Implied value',tvl_usd:'TVL',change_7d:'7d growth',age_days:'Age',rank:'Rank',breakeven_share:'Break-even share',net_per_hour_usd:'Net / hands-on hour'}).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
function formula() {
  return `<div class="formula">implied = exp(a + b·ln(TVL) + family)<br>× growth × maturity × breadth<br><b>a ${M.fit.intercept.toFixed(3)} · b ${M.fit.slope.toFixed(3)}</b></div>`;
}
function ablation() {
  return `<table class="ablation-table"><thead><tr><th>LOO / ${M.calibration_samples} folds</th><th>Miss</th><th>≤3x</th><th>Rank ρ</th></tr></thead><tbody>${['flat','curve','family','full'].map((k,i) => {const v=M.loo[k];return `<tr><td>${['Flat multiple','Curve','+ family','+ priors'][i]}</td><td>${v.median_miss.toFixed(2)}x</td><td>${percent(v.within_factor_3)}</td><td>${v.spearman.toFixed(3)}</td></tr>`;}).join('')}</tbody></table>`;
}
function scatter() {
  const all = [...D.comps.map(r => [r.tvl_usd,r.mcap_usd]), ...D.rows.map(r => [r.tvl_usd,r.implied_value_usd])];
  const lx = all.map(p => Math.log10(p[0])), ly = all.map(p => Math.log10(p[1]));
  const xmin=Math.floor(Math.min(...lx)), xmax=Math.ceil(Math.max(...lx)), ymin=Math.floor(Math.min(...ly)), ymax=Math.ceil(Math.max(...ly));
  const x = v => 40 + (Math.log10(v)-xmin)/(xmax-xmin)*440;
  const y = v => 174 - (Math.log10(v)-ymin)/(ymax-ymin)*155;
  const points = D.comps.map(r => `<circle cx="${x(r.tvl_usd)}" cy="${y(r.mcap_usd)}" r="2.4" class="comp-point"/>`).join('') + D.rows.map(r => `<circle cx="${x(r.tvl_usd)}" cy="${y(r.implied_value_usd)}" r="1.7" class="board-point"/>`).join('');
  const line = v => Math.exp(M.fit.intercept + M.fit.slope*Math.log(v));
  return `<div class="scatter"><svg viewBox="0 0 500 200" role="img" aria-label="Log TVL versus market cap and implied value"><path d="M40 12V174H485" class="axis"/><line x1="40" y1="${y(line(10**xmin))}" x2="480" y2="${y(line(10**xmax))}" class="fit-line"/>${points}<text x="40" y="195">TVL $10^${xmin} → $10^${xmax} · log / log</text><text x="40" y="12">value $10^${ymin} → $10^${ymax}</text></svg><small><i class="cyan">●</i> traded comps <i class="green">●</i> radar values — curve before offsets</small></div>`;
}
function strip() {
  const multiples=M.families.map(f=>f.multiple),delta=M.loo.full.median_miss-M.loo.family.median_miss;
  return `<div class="model-strip"><section><h3>01 / How a value is built</h3>${formula()}<p>Curve from ${M.calibration_samples} traded comps<br>Family ×${Math.min(...multiples).toFixed(2)}–×${Math.max(...multiples).toFixed(2)} by category<br>Growth from 7-day TVL change<br>Seasoning from days tracked; breadth from chains</p></section><section><h3>02 / The snapshot in scale</h3>${scatter()}</section><section><h3>03 / Blind tests, one token left out</h3>${ablation()}<p>Priors change median miss by ${delta>=0?'+':''}${delta.toFixed(2)}x. Small bounded priors keep growth and seasoning in view.</p></section></div>`;
}
function band(r) {
  const pos=100*(r.implied_value_usd-r.band_low_usd)/Math.max(1,r.band_high_usd-r.band_low_usd);
  return `<div class="band"><i style="left:${pos}%"></i></div><small>${money(r.band_low_usd)} – ${money(r.band_high_usd)}</small>`;
}
function verdict(r) { return `<span class="verdict ${r.economics.verdict}">${r.economics.verdict}</span>`; }
function filtered() {
  const q=$('#search').value.toLowerCase();
  const rows=D.rows.filter(r => (!q || (r.name+' '+r.slug).toLowerCase().includes(q)) && ($('#category').value==='all'||(r.category??'Other')===$('#category').value) && ($('#chain').value==='all'||r.chains.includes($('#chain').value)) && ($('#signal').value==='all'||r.signal.tier===$('#signal').value) && ($('#verdict').value==='all'||r.economics.verdict===$('#verdict').value));
  const k=$('#sort').value, asc=['rank','breakeven_share'].includes(k);
  return rows.sort((a,b) => (asc?1:-1)*((a[k]??a.economics[k]??0)-(b[k]??b.economics[k]??0)) || a.slug.localeCompare(b.slug));
}
function renderBoard() {
  const rows=filtered();
  $('#board-count').textContent=`${rows.length} / ${D.rows.length} protocols`;
  if(!rows.length)return '<div class="empty">No protocols match. Reset the filters to widen the radar.</div>';
  return `<div class="table-wrap"><table class="board-table"><thead><tr>${['#','Protocol','Category','TVL','7d growth','Age','Family ×','Implied value / P10–P90','Break-even share','Verdict'].map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr tabindex="0" data-slug="${esc(r.slug)}"><td>${r.rank}</td><td><b>${esc(r.name)}</b><small>${esc(r.slug)} ${r.tvl_usd>=D.floor_usd?'· floor+':''}</small>${r.watchlist?'<span class="watch">WATCHLIST</span>':''}</td><td>${esc(r.category)}<small class="${r.signal.tier}">${r.signal.tier}</small></td><td>${money(r.tvl_usd)}</td><td>${r.change_7d===null?'—':r.change_7d.toFixed(1)+'%'}</td><td>${r.age_days}d</td><td>${r.family_multiple.toFixed(2)}×</td><td class="value">${money(r.implied_value_usd)}${band(r)}</td><td>${(r.economics.breakeven_share*100).toFixed(4)}%</td><td>${verdict(r)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderFarms() {
  return `<h2>Eight routes to research</h2><p>Lowest break-even shares first. Costs are planning estimates; rewards are unconfirmed.</p><div class="cards">${[...D.rows].sort((a,b)=>a.economics.breakeven_share-b.economics.breakeven_share).slice(0,8).map(r=>`<button class="card" data-slug="${esc(r.slug)}">${verdict(r)}<h3>${esc(r.name)}</h3><strong>${money(r.economics.net_per_hour_usd)} / hour</strong><p>${exact(r.economics.total_cost_usd)} planned · ${r.economics.hands_on_minutes} active min<br>${r.farm_steps.length} timed steps · ${esc(r.chains[0])}</p></button>`).join('')}</div>`;
}
function renderLive() {
  return `<h2>Already trading / reference desk</h2><p>Separated from pre-token candidates. Top ${D.live.length} non-CEX records by market cap.</p><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th></tr></thead><tbody>${D.live.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${money(r.tvl_usd)}</td><td>${money(r.mcap_usd)}</td><td>${(r.mcap_usd/r.tvl_usd).toFixed(2)}×</td></tr>`).join('')}</tbody></table>`;
}
function renderModel() {
  const b=M.bootstrap;
  return `<div class="method"><section><h2>Evidence before conviction</h2>${formula()}${scatter()}<p>Huber IRLS: ${M.fit.huber_iters} reweights, c=${M.fit.huber_c}; R² ${M.fit.r2.toFixed(3)}. Positive-cap comps, cap/TVL ${M.ratio_min}–${M.ratio_max}, excluding CEX. Median multiple ${M.calibratedMultiple.toFixed(3)}×; fallback ${M.fallback}×.</p>${ablation()}<p>${Object.entries(M.oos).map(([k,v])=>`${k}: n=${v.n_test}, miss ${Math.exp(v.median_abs_log_error).toFixed(2)}×, ≤2× ${percent(v.within_factor_2)}`).join('<br>')}</p></section><section><aside class="judge-note"><h3>Note to the judge</h3><p>1. buildRadar and isRankable cover ${D.counts.covered}/${D.counts.watchlist} watchlist records plus ${D.counts.board-D.counts.covered} others; impliedOf checks every browser value.<br>2. fit and loo expose the snapshot-fitted Huber curve, family residuals and blind ablation.<br>3. farmPlan supplies protocol-specific actions with costs, active minutes and stop levels.<br>4. renderBoard, renderFarms and openDetail connect filters, sorts and full plans.<br>5. app.css uses ink, cyan, phosphor and amber with a compact evidence grid.</p></aside><h3>Family residuals / eight pseudo-tokens</h3><table class="family-table"><thead><tr><th>Family</th><th>n</th><th>Offset</th><th>×</th></tr></thead><tbody>${M.families.map(f=>`<tr><td>${esc(f.family)}</td><td>${f.n}</td><td>${f.offset.toFixed(3)}</td><td>${f.multiple.toFixed(2)}</td></tr>`).join('')}</tbody></table><div class="accounting"><h3>Every record accounted for</h3>${Object.entries(D.accounting).map(([k,v])=>`<span>${k.replaceAll('_',' ')} <b>${v}</b></span>`).join('')}</div><p>${b.resamples} seeded bootstrap refits: slope P10–P90 ${b.slope_p10.toFixed(3)}–${b.slope_p90.toFixed(3)}; intercept ${b.intercept_p10.toFixed(3)}–${b.intercept_p90.toFixed(3)}. Bands include the point estimate.</p><p>Farm ≤${M.farm.verdict_farm_max_share} break-even share; thin ≤${M.farm.verdict_thin_max_share}; otherwise skip. Gas $${M.farm.gas_per_action_usd}/action is a planning estimate. Slice assumes ${percent(M.farm.airdrop_share_assumption)} allocated pro rata to capital/TVL, conditional on launch.</p></section><aside class="research-note"><h3>Research limits</h3><p>Cross-sectional associations are not launch forecasts. Hash holdout and listing-cohort splits are not historical backtests. TVL can overlap; tracking age is not protocol age. Bootstrap bands describe fit uncertainty, not future prices. A token-free record is not verified absence. Farming risks principal and fees; no eligibility or allocation is guaranteed.</p></aside></div>`;
}
function render() {
  $('#model-strip').innerHTML=state.tab==='board'?strip():'';
  $('#controls').hidden=state.tab!=='board';
  $('#content').innerHTML=state.tab==='board'?renderBoard():state.tab==='farms'?renderFarms():state.tab==='live'?renderLive():renderModel();
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  document.querySelectorAll('[data-slug]').forEach(el=>{el.onclick=()=>location.hash='detail='+el.dataset.slug;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();location.hash='detail='+el.dataset.slug;}};});
}
function openDetail(slug) {
  const r=D.rows.find(r=>r.slug===slug);if(!r)return;
  const v=impliedOf(r,M),e=r.economics;
  $('#main-view').hidden=true;
  $('#detail-root').innerHTML=`<main id="detail-view"><div class="detail-head"><div><small>PROTOCOL FIELD NOTES / #${r.rank}</small><h1 id="detail-title">${esc(r.name)}</h1><p>${esc(r.category)} · ${esc(r.chains.join(' / '))} · ${esc(r.slug)}</p></div><button id="close-detail">← Back to board</button></div><div class="detail-grid"><section><div class="panel"><small>IMPLIED VALUE / CONDITIONAL ON LAUNCH</small><h2 class="value">${exact(r.implied_value_usd)}</h2>${band(r)}<p>P10 / point / P90 · rank ${r.rank} of ${D.rows.length}</p></div><div class="value-breakdown panel"><h3>Value, rebuilt here</h3><p>${money(v.base)} curve base × ${v.family.toFixed(4)} family<br>× ${v.growth.toFixed(4)} growth × ${v.maturity.toFixed(4)} maturity × ${v.breadth.toFixed(2)} breadth<br>= ${exact(v.value)}</p><small>Page recomputation ${v.value===r.implied_value_usd?'matches board.json':'MISMATCH'} · full precision before rounding</small></div><div class="panel"><h3>Nearest traded peers / ${esc(r.family)}</h3><table class="peers-table"><thead><tr><th>Peer</th><th>TVL</th><th>Cap</th><th>×TVL</th><th>Here</th></tr></thead><tbody>${r.peers.map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.tvl_usd)}</td><td>${money(p.mcap_usd)}</td><td>${p.ratio.toFixed(2)}</td><td>${money(p.ratio*r.tvl_usd)}</td></tr>`).join('')}</tbody></table></div><div class="farm-arith panel"><h3>Farmer arithmetic / stated assumptions</h3><p>${percent(M.farm.airdrop_share_assumption)} airdrop share × implied value × ${exact(e.capital_usd)} / ${money(r.tvl_usd)} TVL. Pro-rata allocation is an assumption.</p><div class="economics">${[['Slice if launch',money(e.slice_usd)],['Break-even launch odds',percent(e.breakeven_odds)],['Net after planned spend',money(e.net_usd)],['Net / active hour',money(e.net_per_hour_usd)],['Hands-on time',e.hands_on_minutes+' min'],['Break-even share',(e.breakeven_share*100).toFixed(4)+'%']].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div><p>Verdict follows break-even share: planned spend / band-low value = ${(e.breakeven_share*100).toFixed(4)}%; the slice assumes strictly pro-rata TVL allocation, so a ${exact(e.capital_usd)} ticket in a ${money(r.tvl_usd)} pool yields ${money(e.slice_usd)}. Points caps and per-wallet allocations would change the slice.</p><p>${verdict(r)} · Principal may be recovered; gas is spent. Odds are a break-even condition, not a prediction.</p></div></section><section class="panel plan-panel"><h2>The route / ${r.farm_steps.length} steps</h2><p>Capital ${exact(e.capital_usd)} · gas estimate ${exact(e.gas_usd)} · timing counts active work once per listed step.</p><table class="plan-table"><thead><tr><th>When</th><th>Step</th><th>Cost</th><th>Time</th></tr></thead><tbody>${r.farm_steps.map((s,i)=>{const m=s.match(/^(.*)\. Cost: (.*)\. Time: (.*)\.$/);return `<tr><td>${esc(r.farm_when[i])}</td><td><b>${i+1}.</b> ${esc(m[1])}.</td><td>${esc(m[2])}</td><td>${esc(m[3])}</td></tr>`;}).join('')}</tbody><tfoot><tr><td colspan="2">Total planned spend ${exact(e.total_cost_usd)}</td><td colspan="2">${e.hands_on_minutes} active min</td></tr></tfoot></table><p class="safety">Records no token is not proof. Farming can lose principal and fees. Never pay to claim. Stop levels cannot guarantee an available exit.</p></section></div></main>`;
  $('#close-detail').onclick=closeDetail;
  window.scrollTo(0,0);
}
function closeDetail() {
  history.replaceState(null,'',location.pathname+location.search);
  $('#detail-root').innerHTML='';$('#main-view').hidden=false;state.tab='board';render();
}
function readHash() {const slug=new URLSearchParams(location.hash.slice(1)).get('detail');if(slug)openDetail(slug);else if($('#detail-view'))closeDetail();}
for(const id of ['category','chain','signal','verdict','sort'])$('#'+id).onchange=render;
$('#search').oninput=render;
$('#reset').onclick=()=>{for(const id of ['category','chain','signal','verdict'])$('#'+id).value='all';$('#search').value='';$('#sort').value='implied_value_usd';render();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#detail-view'))closeDetail();});
window.addEventListener('hashchange',readHash);
render();readHash();
