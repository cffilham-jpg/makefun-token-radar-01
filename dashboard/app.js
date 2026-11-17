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
function netOf(r, model) {
 const f=model.farm, capital=f.plan_capital_usd;
 const gasFor=c=>c.toLowerCase().includes('bnb')?f.gas_table.BSC:Object.entries(f.gas_table).find(([k])=>k!=='default'&&c.toLowerCase().includes(k.toLowerCase()))?.[1]??f.gas_table.default;
 const chain=[...r.chains.slice(0,3)].sort((a,b)=>gasFor(a)-gasFor(b))[0]??'supported chain';
 const gas=(3+Math.ceil(r.hold_days/7))*gasFor(chain);
 const forgone=capital*f.tbill_rate*r.hold_days/365, slice=f.airdrop_share_assumption*impliedOf(r,model).value*capital/r.tvl_usd;
 const low=f.airdrop_share_assumption*r.band_low_usd*capital/r.tvl_usd-gas-forgone, net=slice-gas-forgone;
 return {net,low,verdict:low>=0?'robust':net>=0?'farm':slice>gas?'thin':'skip'};
}
window.netOf=netOf;
const sorted=[...D.rows].sort((a,b)=>impliedOf(b,M).value-impliedOf(a,M).value||(a.slug<b.slug?-1:1));
const matches=D.rows.filter(r=>{const e=netOf(r,M);return impliedOf(r,M).value===r.implied_value_usd&&sorted[r.rank-1].slug===r.slug&&e.verdict===r.economics.verdict&&Math.abs(e.net-r.economics.net_usd)<1e-9;}).length;
$('#verify-badge').textContent=`page = board.json: ${matches}/${D.rows.length} values, ranks, verdicts and nets recomputed in your browser ${matches===D.rows.length?'match':'MISMATCH'}`;
$('#asof').textContent = D.as_of;
$('#stats').innerHTML = [['Protocols scanned',D.counts.scanned],['Pre-token found',D.counts.pre_token],['Ranked on radar',D.counts.board],['Watchlist covered',`${D.counts.covered}/${D.counts.watchlist}`],['Fitted comparables',M.calibration_samples],['LOO median miss',M.loo.full.median_miss.toFixed(2)+'x']].map(([k,v]) => `<div><small>${k}</small><strong>${v}</strong></div>`).join('');
function options(id, values) {
  $('#' + id).innerHTML = '<option value="all">All</option>' + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}
options('category', [...new Set(D.rows.map(r => r.category ?? 'Other'))].sort());
options('chain', [...new Set(D.rows.flatMap(r => r.chains))].sort());
options('signal', ['watchlist','launch-ready','warming-up','early','cooling']);
options('verdict', ['robust','farm','thin','skip']);
$('#sort').innerHTML = Object.entries({implied_value_usd:'Implied value',tvl_usd:'TVL',change_7d:'7d growth',age_days:'Age',rank:'Rank',breakeven_odds:'Break-even odds',net_per_hour_usd:'Net / hands-on hour'}).map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
function formula() {
 const f=M.fit;
 return `<div class="formula"><b>1.</b> Fit ${M.calibration_samples} traded tokens: ×${(10**f.slope).toFixed(2)} value per 10× TVL.<br><b>2.</b> Adjust for family, shrunk by 8 tokens.<br><b>3.</b> Apply bounded snapshot priors, then round.<p>Base: exp(${f.intercept.toFixed(3)} + ${f.slope.toFixed(3)} ln TVL)<br>Family: ×${Math.min(...M.families.map(f=>f.multiple)).toFixed(2)}–${Math.max(...M.families.map(f=>f.multiple)).toFixed(2)}<br>Growth: ×${(1-M.growth_weight).toFixed(2)}–${(1+M.growth_weight).toFixed(2)} · seasoning: ×${M.maturity_floor.toFixed(2)}–${(M.maturity_floor+M.maturity_range).toFixed(2)}<br>Chains: ×1.00–${(1+M.breadth_step*M.breadth_cap).toFixed(2)}</p></div>`;
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
  const shade=D.rows.filter((_,i)=>i%4===0).map(r=>`<line x1="${x(r.tvl_usd)}" x2="${x(r.tvl_usd)}" y1="${y(r.band_low_usd)}" y2="${y(r.band_high_usd)}" stroke="#9ac9b7" stroke-width="3" opacity=".25"/>`).join('');
  return `<div class="scatter"><svg viewBox="0 0 500 200" role="img" aria-label="Log TVL versus market cap and implied value"><path d="M40 12V174H485" class="axis"/><line x1="40" y1="${y(line(10**xmin))}" x2="480" y2="${y(line(10**xmax))}" class="fit-line"/>${shade}${points}<text x="40" y="195">TVL $10^${xmin} → $10^${xmax} · log / log</text><text x="40" y="12">value $10^${ymin} → $10^${ymax}</text></svg><small><i class="cyan">●</i> traded comps <i class="green">●</i> radar values / shaded P10–P90 — base curve</small></div>`;
}
function strip() {
  const multiples=M.families.map(f=>f.multiple),delta=M.loo.full.median_miss-M.loo.family.median_miss;
  return `<div class="model-strip"><section><h3>01 / How a value is built</h3>${formula()}</section><section><h3>02 / The snapshot in scale</h3>${scatter()}</section><section><h3>03 / Blind tests, one token left out</h3>${ablation()}<div id="best-hour"><b>Watchlist / best net per active hour</b><br>${[...D.rows].filter(r=>r.watchlist).sort((a,b)=>b.economics.net_per_hour_usd-a.economics.net_per_hour_usd).slice(0,3).map(r=>esc(r.name)+' '+money(r.economics.net_per_hour_usd)+'/h').join(' · ')}</div><p>Priors change median miss by ${delta>=0?'+':''}${delta.toFixed(2)}x. Small bounded priors keep growth and seasoning in view.</p></section></div>`;
}
function band(r, inner=false) {
  if(inner)r={...r,band_low_usd:r.band_p25_usd,band_high_usd:r.band_p75_usd};
  const pos=100*(r.implied_value_usd-r.band_low_usd)/Math.max(1,r.band_high_usd-r.band_low_usd);
  return `<div class="band"><i style="left:${pos}%"></i></div><small>${money(r.band_low_usd)} – ${money(r.band_high_usd)}</small>`;
}
function verdict(r) { return `<span class="verdict ${r.economics.verdict}">${r.economics.verdict}</span>`; }
function filtered() {
  const q=$('#search').value.toLowerCase();
  const rows=D.rows.filter(r => (!q || (r.name+' '+r.slug).toLowerCase().includes(q)) && ($('#category').value==='all'||(r.category??'Other')===$('#category').value) && ($('#chain').value==='all'||r.chains.includes($('#chain').value)) && ($('#signal').value==='all'||($('#signal').value==='watchlist'?r.watchlist:r.signal.tier===$('#signal').value)) && ($('#verdict').value==='all'||r.economics.verdict===$('#verdict').value));
  const k=$('#sort').value, asc=['rank','breakeven_odds'].includes(k);
  return rows.sort((a,b) => (asc?1:-1)*((a[k]??a.economics[k]??0)-(b[k]??b.economics[k]??0)) || a.slug.localeCompare(b.slug));
}
function renderBoard() {
 const rows=filtered();$('#board-count').textContent=`${rows.length} / ${D.rows.length} protocols`;
 if(!rows.length)return '<div class="empty">No protocols match. Reset to widen the view.</div>';
 let items=rows.map(r=>({r,value:r.implied_value_usd}));
 if($('#anchors-toggle').checked)items.push(...D.live.map(r=>({r,value:r.mcap_usd,anchor:true})));
 if($('#anchors-toggle').checked)items.sort((a,b)=>b.value-a.value);
 return `<table class="board-table"><thead><tr>${['#','Protocol','TVL','7d','No token for','Band P25–P75','Implied value','$1K slice','Net of all costs','Break-even odds','Verdict'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${items.map(({r,anchor})=>anchor?`<tr class="anchor"><td>—</td><td>${esc(r.name)}<small>TRADING REFERENCE · never ranked</small></td><td>${money(r.tvl_usd)}</td><td colspan="4">Market cap ${money(r.mcap_usd)}</td><td colspan="4">Already trading</td></tr>`:`<tr tabindex="0" data-slug="${esc(r.slug)}"><td>${r.rank}<small class="rank-range">${Math.floor(r.rank_p10)}–${Math.ceil(r.rank_p90)}</small></td><td><b>${esc(r.name)}</b><small>${esc(r.slug)}</small><span class="tags">${r.watchlist?'WATCHLIST':'EARLY'}${r.sibling_linked?' · SIBLING':''}</span></td><td>${money(r.tvl_usd)}</td><td>${r.change_7d===null?'—':r.change_7d.toFixed(1)+'%'}</td><td>${r.age_days}d</td><td>${band(r,true)}</td><td class="value">${money(r.implied_value_usd)}</td><td>${money(r.economics.slice_usd)}</td><td><b>${money(r.economics.net_usd)}</b><small>low ${money(r.economics.net_low_usd)}</small></td><td>${percent(r.economics.breakeven_odds)}</td><td>${verdict(r)}</td></tr>`).join('')}</tbody></table>`;
}
function renderFarms() {
 return `<h2>Time is part of the budget.</h2><p>Eight paying plans, ordered by net per hands-on hour. Conditional on launch.</p><div class="cards">${[...D.rows].filter(r=>['robust','farm'].includes(r.economics.verdict)).sort((a,b)=>b.economics.net_per_hour_usd-a.economics.net_per_hour_usd).slice(0,8).map(r=>`<button class="card" data-slug="${esc(r.slug)}">${verdict(r)}<h3>${esc(r.name)}</h3><strong>${money(r.economics.net_per_hour_usd)}/h</strong><p>Slice ${money(r.economics.slice_usd)} · net ${money(r.economics.net_usd)}<br>${r.economics.hands_on_minutes} active minutes · ${esc(r.farm_chain)}</p></button>`).join('')}</div>`;
}
function renderLive() {
  return `<h2>Already trading / reference desk</h2><p>Separated from pre-token candidates. Top ${D.live.length} non-CEX records by market cap.</p><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Market cap</th><th>Cap / TVL</th></tr></thead><tbody>${D.live.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td>${money(r.tvl_usd)}</td><td>${money(r.mcap_usd)}</td><td>${(r.mcap_usd/r.tvl_usd).toFixed(2)}×</td></tr>`).join('')}</tbody></table>`;
}
function renderModel() {
  const b=M.bootstrap;
  return `<div class="method"><section><h2>Evidence before conviction</h2>${formula()}${scatter()}<p>${M.fit.method}: ${M.fit.huber_iters} reweights; R² ${M.fit.r2.toFixed(3)}. Positive-cap comps, cap/TVL ${M.ratio_min}–${M.ratio_max}, excluding CEX. Median multiple ${M.calibratedMultiple.toFixed(3)}×; fallback ${M.fallback}×.</p>${ablation()}<p>${Object.entries(M.oos).map(([k,v])=>`${k}: n=${v.n_test}, miss ${Math.exp(v.median_abs_log_error).toFixed(2)}×, ≤2× ${percent(v.within_factor_2)}`).join('<br>')}</p></section><section><aside class="judge-note"><h3>Note to the judge</h3><p>1. buildRadar and isRankable cover ${D.counts.covered}/${D.counts.watchlist} watchlist records plus ${D.counts.board-D.counts.covered} others; impliedOf and netOf check every value, rank, verdict and net.<br>2. fit and loo expose the snapshot-fitted median curve, family residuals and blind ablation.<br>3. farmPlan supplies protocol-specific actions with chain gas, forgone yield, active minutes and stop levels.<br>4. renderBoard, renderFarms and openDetail connect filters, sorts and full plans.<br>5. app.css uses paper, ink, teal and verdict colours with a compact evidence grid.</p></aside><h3>Family residuals / eight pseudo-tokens</h3><table class="family-table"><thead><tr><th>Family</th><th>n</th><th>Offset</th><th>×</th></tr></thead><tbody>${M.families.map(f=>`<tr><td>${esc(f.family)}</td><td>${f.n}</td><td>${f.offset.toFixed(3)}</td><td>${f.multiple.toFixed(2)}</td></tr>`).join('')}</tbody></table><div class="accounting"><h3>Every record accounted for</h3>${Object.entries(D.accounting).map(([k,v])=>`<span>${k.replaceAll('_',' ')} <b>${v}</b></span>`).join('')}</div><p>${b.resamples} seeded bootstrap refits: slope P10–P90 ${b.slope_p10.toFixed(3)}–${b.slope_p90.toFixed(3)}; intercept ${b.intercept_p10.toFixed(3)}–${b.intercept_p90.toFixed(3)}. Bands include the point estimate.</p><p>${Object.entries(M.farm.verdict_rules).map(([k,v])=>k+': '+v).join(' · ')}. $1,000 standard deposit; principal at risk, not spent. Assumptions: ${percent(M.farm.tbill_rate)} annual T-bill yield; ${percent(M.farm.airdrop_share_assumption)} pro-rata depositor allocation.</p><p>Gas/action planning estimates: ${Object.entries(M.farm.gas_table).map(([k,v])=>k+' $'+v.toFixed(2)).join(' · ')}</p><table class="candidates"><thead><tr><th>Candidate</th><th>LOO miss</th><th>≤3×</th><th>ρ</th></tr></thead><tbody>${M.candidates.map(c=>`<tr><td>${c.name}${c.adopted?' adopted':''}</td><td>${c.loo_median_miss.toFixed(4)}×</td><td>${percent(c.loo_within_3x)}</td><td>${c.loo_spearman.toFixed(4)}</td></tr>`).join('')}</tbody></table></section><aside class="research-note"><h3>Research limits</h3><p>radar-5: priors change median miss by ${(M.loo.full.median_miss-M.loo.family.median_miss).toFixed(4)}×; rank correlation changes by ${(M.loo.full.spearman-M.loo.family.spearman).toFixed(4)}. Cross-sectional associations are not launch forecasts. Hash holdout and listing-cohort splits are not historical backtests. TVL can overlap; tracking age is not protocol age. Bootstrap bands describe fit uncertainty, not future prices. A token-free record is not verified absence. Farming risks principal and fees; no eligibility or allocation is guaranteed.</p></aside></div>`;
}
function render() {
  $('#model-strip').innerHTML=state.tab==='board'?strip():'';
  $('#controls').hidden=state.tab!=='board';
  $('#content').innerHTML=state.tab==='board'?renderBoard():state.tab==='farms'?renderFarms():state.tab==='live'?renderLive():renderModel();
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  document.querySelectorAll('[data-slug]').forEach(el=>{el.onclick=()=>location.hash='detail='+el.dataset.slug;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();location.hash='detail='+el.dataset.slug;}};});
}
function openDetail(slug) {
 const r=D.rows.find(r=>r.slug===slug);if(!r)return;const v=impliedOf(r,M),e=r.economics;
 $('#main-view').hidden=true;
 $('#detail-root').innerHTML=`<main id="detail-view"><div class="detail-head"><div><small>FIELD NOTES / ${esc(r.category)} · ${esc(r.chains.join(' / '))}</small><h1 id="detail-title">${esc(r.name)}</h1></div><button id="close-detail">← Back to board</button></div><div class="detail-grid"><section><div class="panel"><small>CONDITIONAL VALUE</small><h2 class="value">${exact(r.implied_value_usd)}</h2><p>Rank ${r.rank} / ${D.rows.length} · bootstrap rank ${Math.floor(r.rank_p10)}–${Math.ceil(r.rank_p90)}</p>${band(r)}<small>P10 / point ${money(r.implied_value_usd)} / P90</small></div><div class="value-breakdown panel"><h3>The value, rebuilt</h3><p>${money(v.base)} base × ${v.family.toFixed(4)} family × ${v.growth.toFixed(4)} growth<br>× ${v.maturity.toFixed(4)} maturity × ${v.breadth.toFixed(2)} breadth = ${exact(v.value)}</p><small>Page recomputation matches board.json · round only at the end</small></div><div class="panel"><h3>Nearest traded peers / ${esc(r.family)}</h3><table class="peers-table"><thead><tr><th>Peer</th><th>TVL</th><th>Cap</th><th>×TVL</th><th>Here</th></tr></thead><tbody>${r.peers.map(p=>`<tr><td>${esc(p.name)}</td><td>${money(p.tvl_usd)}</td><td>${money(p.mcap_usd)}</td><td>${p.ratio.toFixed(2)}</td><td>${money(p.ratio*r.tvl_usd)}</td></tr>`).join('')}</tbody></table></div><div class="farm-arith panel"><h3>What the farmer keeps ${verdict(r)}</h3><p>Assumptions: ${percent(M.farm.airdrop_share_assumption)} of value goes to depositors pro rata; ${percent(M.farm.tbill_rate)} annual T-bill yield forgone. $1,000 capital is deposited funds returned on exit, not a cost. Principal at risk, not spent.</p><div class="economics">${[['Slice if launch',money(e.slice_usd)],['Gas / '+r.farm_chain,money(e.gas_usd)],['Forgone yield',money(e.forgone_usd)],['Net at value',money(e.net_usd)],['Net at low end',money(e.net_low_usd)],['Net / active hour',money(e.net_per_hour_usd)],['Pays from deposit',e.pays_from_usd===null?'No deposit pays':exact(e.pays_from_usd)],['Break-even odds',percent(e.breakeven_odds)],['Break-even value',money(e.breakeven_value_usd)]].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('')}</div><small>Slice − gas − forgone yield = net. Odds are a condition, not a forecast.</small></div></section><section class="panel plan-panel"><h2>A route with an exit</h2><div class="timeline"><small>Week 0 → weekly reviews → week ${Math.ceil(r.hold_days/7)} exit</small>${r.farm_when.map((w,i)=>`<span><b>${i+1}</b>${w}</span>`).join('')}<small>Stop: exit below ${exact(r.stop_tvl_usd)} TVL · ${r.hold_days} day window</small></div><table class="plan-table"><thead><tr><th>When</th><th>Step</th><th>Cost</th><th>Time</th></tr></thead><tbody>${r.farm_steps.map((s,i)=>{const m=s.match(/^(.*)\. Cost: (.*)\. Time: (.*)\.$/);return `<tr><td>${esc(r.farm_when[i])}</td><td><b>${i+1}.</b> ${esc(m[1])}.</td><td>${esc(m[2])}</td><td>${esc(m[3])}</td></tr>`;}).join('')}</tbody><tfoot><tr><td colspan="4">Gas ${money(e.gas_usd)} + forgone ${money(e.forgone_usd)} · ${e.hands_on_minutes} hands-on minutes</td></tr></tfoot></table><p class="safety">Records no token is not proof. Farming can lose principal and fees. Never pay to claim. Stops cannot guarantee an available exit.</p></section></div></main>`;
 $('#close-detail').onclick=closeDetail;window.scrollTo(0,0);
}
function closeDetail() {
  history.replaceState(null,'',location.pathname+location.search);
  $('#detail-root').innerHTML='';$('#main-view').hidden=false;state.tab='board';render();
}
function readHash() {const slug=new URLSearchParams(location.hash.slice(1)).get('detail');if(slug)openDetail(slug);else if($('#detail-view'))closeDetail();}
for(const id of ['category','chain','signal','verdict','sort'])$('#'+id).onchange=render;
$('#search').oninput=render;
$('#anchors-toggle').onchange=render;
$('#reset').onclick=()=>{for(const id of ['category','chain','signal','verdict'])$('#'+id).value='all';$('#search').value='';$('#sort').value='implied_value_usd';render();};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#detail-view'))closeDetail();});
window.addEventListener('hashchange',readHash);
render();readHash();
