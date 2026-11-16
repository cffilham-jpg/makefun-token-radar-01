export class SnapshotError extends Error {}
export type Protocol = {slug:string;name:string;category:string|null;chains:string[];tvl_usd:number;change_7d:number|null;mcap_usd:number|null;listed_at:string|null;gecko_id:string|null;symbol:string|null};
export type Snapshot = {as_of:string;source:string;floor_usd:number;protocols:Protocol[];watchlist:string[]};
const day = (s:string) => Date.parse(s+'T00:00:00Z');
const dateOK = (v:unknown) => typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(day(v)) && new Date(day(v)).toISOString().slice(0,10)===v;
export function parseSnapshot(text:string):Snapshot {
  try {
    const s=JSON.parse(text); const fail=()=>{throw new SnapshotError('Invalid snapshot shape');};
    if(!s || !dateOK(s.as_of)||typeof s.source!=='string'||!Number.isSafeInteger(s.floor_usd)||s.floor_usd<=0||!Array.isArray(s.protocols)||!s.protocols.length||!Array.isArray(s.watchlist)) fail();
    const seen=new Set<string>();
    for(const p of s.protocols){
      if(!p||typeof p.slug!=='string'||!/^\S{1,128}$/.test(p.slug)||seen.has(p.slug)||typeof p.name!=='string'||!p.name.trim()||!(p.category===null||typeof p.category==='string')||!Array.isArray(p.chains)||!p.chains.every((c:unknown)=>typeof c==='string'&&c.length>0)||!Number.isSafeInteger(p.tvl_usd)||p.tvl_usd<0||!(p.change_7d===null||typeof p.change_7d==='number'&&Number.isFinite(p.change_7d))||!(p.mcap_usd===null||Number.isSafeInteger(p.mcap_usd))||!(p.listed_at===null||dateOK(p.listed_at))||!['gecko_id','symbol'].every(k=>p[k]===null||typeof p[k]==='string')) fail();
      seen.add(p.slug);
    }
    if(!s.watchlist.every((v:unknown)=>typeof v==='string'&&seen.has(v))||new Set(s.watchlist).size!==s.watchlist.length) fail();
    return s;
  } catch(e){if(e instanceof SnapshotError)throw e;throw new SnapshotError('Snapshot is not valid JSON');}
}
const pre=(p:Protocol)=>p.mcap_usd===null&&p.gecko_id===null&&p.symbol===null;
/** Mirror every replicable part of the house watchlist eligibility rule, without its TVL floor.
 * DefiLlama's parentProtocol is not carried in the snapshot's ten fields, so we cannot
 * reproduce that exclusion. A record excluded by the house for having a parent may
 * still rank: the watchlist is a floor, and other protocols are no worse subjects.
 */
export function isRankable(p:Protocol):boolean {
 const excludedCategories=new Set(['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX']);
 return pre(p) && !excludedCategories.has(p.category??'')
   && !/\b(wrapped|staked|staking)\b/i.test(p.name)
   && !/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(p.name)
   && !/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name);
}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const clamp=(x:number,a:number,b:number)=>Math.min(b,Math.max(a,x));
export function ageOf(p:Protocol,s:Snapshot){return p.listed_at===null?365:Math.max(0,Math.floor((day(s.as_of)-day(p.listed_at))/86400000));}
// radar-3 fits log market cap against log TVL; all uncertainty is conditional on these comps.
const median=(xs:number[])=>quantile(xs,.5);
function quantile(xs:number[],q:number){const a=[...xs].sort((a,b)=>a-b);if(!a.length)return 0;const i=(a.length-1)*q,l=Math.floor(i);return a[l]+(a[Math.ceil(i)]-a[l])*(i-l);}
function fitCurve(ps:Protocol[],multiple:number){
 const n=ps.length,x=ps.map(p=>Math.log(p.tvl_usd)),y=ps.map(p=>Math.log(p.mcap_usd!));
 const mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;
 const xx=x.reduce((a,v)=>a+(v-mx)**2,0),xy=x.reduce((a,v,i)=>a+(v-mx)*(y[i]-my),0);
 const b=xy/xx,a=my-b*mx,ok=n>=10&&b>0&&Number.isFinite(b)&&Number.isFinite(a);
 const slope=ok?b:1,intercept=ok?a:Math.log(multiple);
 const total=y.reduce((s,v)=>s+(v-my)**2,0),error=y.reduce((s,v,i)=>s+(v-intercept-slope*x[i])**2,0);
 return {slope,intercept,r2:total>0?1-error/total:0,n,method:ok?'log-log OLS':'median-multiple fallback'};
}
function multipleOf(ps:Protocol[]){return ps.length<10?.25:median(ps.map(p=>p.mcap_usd!/p.tvl_usd));}
function evaluate(train:Protocol[],test:Protocol[]){const f=fitCurve(train,multipleOf(train));const errors=test.map(p=>Math.abs(Math.log(p.mcap_usd!)-(f.intercept+f.slope*Math.log(p.tvl_usd))));return {n_test:test.length,median_abs_log_error:test.length?median(errors):null,within_factor_2:test.length?errors.filter(e=>e<=Math.log(2)).length/test.length:null};}
function mulberry32(seed:number){return ()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
const capitalOf=(p:Protocol)=>p.tvl_usd>=1e9?250:p.tvl_usd>=1e8?150:p.tvl_usd>=1e7?100:50;
const holdOf=(age:number)=>age<180?90:age<365?60:30;
function action(p:Protocol,chain:string,capital:number){
 const c=(p.category??'').toLowerCase();let verb='Deposit USDC';
 if(/lend/.test(c))verb='Supply USDC';
 else if(/dex|yield|farm/.test(c))verb='Provide liquidity';
 else if(/perp|derivative/.test(c))verb='Deposit margin and open one small hedge';
 else if(/bridge/.test(c))verb='Bridge USDC';
 else if(/stak/.test(c))verb='Stake the supported asset';
 else if(/cdp|stablecoin/.test(c))verb='Mint or deposit the stable asset';
 else if(/rwa/.test(c))verb='Mint the yield asset';
 else if(/curator|allocator/.test(c))verb='Deposit into a vault';
 else if(/prediction/.test(c))verb='Fund and place one position';
 else if(/insurance/.test(c))verb='Buy cover';
 return `${verb} with $${capital} through ${p.name} on ${chain}`;
}
export function farmPlan(p:Protocol,age:number){
 const capital=capitalOf(p),hold=holdOf(age),gas=(3+Math.ceil(hold/7))*10,total=capital+gas,chain=p.chains[0]??'the supported main chain';
 const variant=(i:number,a:string[])=>a[hash(p.slug+':'+i)%a.length];
 const step=(a:string,c:string,t:string)=>`${a.replace(/[. ]+$/,'')}. Cost: ${c}. Time: ${t}.`;
 const steps=[
 step(variant(0,['Create a fresh wallet and store its seed offline; verify the receiving address','Isolate farming funds in a fresh wallet with its seed stored offline']),'$0 setup','10 minutes'),
 step(action(p,chain,capital)+'; verify contracts, asset support and withdrawal terms',`$${capital} capital at risk; $10 planned gas`,'15 minutes'),
 step(`Budget $${total} total planned spend: $${capital} capital plus $${gas} gas estimate for ${3+Math.ceil(hold/7)} actions at $10 each; keep a log of every receipt and actual fee`, 'planning only; capital may be recoverable','10 minutes'),
 step(variant(2,['Return weekly for one eligible core action; avoid artificial volume and log receipts','Perform one core action weekly after checking protocol eligibility rules']), '$10 gas estimate per action','10 minutes weekly'),
 step(`Hold for ${hold} days, reviewing solvency and withdrawal availability weekly`, `$${capital} remains exposed`,`${hold} days`),
 step(p.chains.length>1?`Inspect ${p.name} on ${p.chains[1]}; consider a second-chain route only by reallocating existing capital within the budget`:`Check ${p.name}'s points page and record eligibility and snapshot rules`, '$0 read-only research; extra transactions require a revised budget','10 minutes'),
 step(variant(6,['Rehearse the exit with a small test withdrawal and reconcile the receipt in your log','Test a small withdrawal before the final exit and record recovered capital']), '$10 planned gas','10 minutes')];
 const n=7+hash(p.slug)%3;
 // Weekly cadence and holding window share a step, leaving room for every required action.
 steps[3]=step(`Return weekly for one eligible core action over ${hold} days; review solvency, log receipts and avoid artificial volume`, '$10 gas estimate per action', '10 minutes weekly');
 steps.splice(4,1);
 if(n>=8)steps.push(step('Review the logged fees against the planned budget; pause if eligibility or costs change','$0 review','5 minutes'));
 if(n===9)steps.push(step('Read protocol risk disclosures and document contract, asset and liquidity risks without adding transactions','$0 research','10 minutes'));
 steps.push(step(variant(5,['Use only protocol-published claim links; never pay to claim; log wallet, fees and exit dates','Keep receipts and a safety log; never pay to claim and verify every protocol-published link']),'$0 review; any future claim gas is outside this plan','5 minutes'));
 // Optional reviews vary length; the exit and final safety steps are never removed.
 if(steps.some(s=>s.length<20||s.length>600))throw new Error('Invalid generated plan');return steps;
}
export function buildRadar(s:Snapshot){
 const comps=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.tvl_usd>0&&p.category!=='CEX'&&p.mcap_usd!/p.tvl_usd>=.02&&p.mcap_usd!/p.tvl_usd<=10);
 const calibratedMultiple=multipleOf(comps),fit=fitCurve(comps,calibratedMultiple);
 const dated=comps.filter(p=>p.listed_at!==null),cut=median(dated.map(p=>day(p.listed_at!)));
 const oos={holdout:evaluate(comps.filter(p=>hash(p.slug)%5!==0),comps.filter(p=>hash(p.slug)%5===0)),time_split:evaluate(dated.filter(p=>day(p.listed_at!)<=cut),dated.filter(p=>day(p.listed_at!)>cut))};
 const random=mulberry32(0x52414433),fits=Array.from({length:200},()=>{const sample=Array.from({length:comps.length},()=>comps[Math.floor(random()*comps.length)]);return fitCurve(sample,multipleOf(sample));});
 const bootstrap={resamples:200,slope_p10:quantile(fits.map(f=>f.slope),.1),slope_p90:quantile(fits.map(f=>f.slope),.9),intercept_p10:quantile(fits.map(f=>f.intercept),.1),intercept_p90:quantile(fits.map(f=>f.intercept),.9)};
 const model={calibratedMultiple,calibration_samples:comps.length,fit,oos,bootstrap,ratio_min:.02,ratio_max:10,fallback:.25,growth_weight:.5,growth_scale:50,maturity_floor:.55,maturity_range:.45,maturity_days:1095,unknown_age_days:365,breadth_step:.05,breadth_cap:5,farm:{gas_per_action_usd:10,verdict_farm_max_share:.00002,verdict_thin_max_share:.00006}};
 const rows=s.protocols.filter(isRankable).map(p=>{
 const age=ageOf(p,s),growth=1+.5*Math.tanh((p.change_7d??0)/50),maturity=.55+.45*Math.log1p(Math.min(age,1095))/Math.log1p(1095),breadth=1+.05*Math.min(Math.max(p.chains.length-1,0),5);
 const value=(f:typeof fit)=>Math.max(1,Math.round(Math.exp(f.intercept+f.slope*Math.log(p.tvl_usd))*growth*maturity*breadth));
 const implied_value_usd=value(fit),values=fits.map(value),band_low_usd=Math.min(implied_value_usd,Math.max(1,Math.round(quantile(values,.1)))),band_high_usd=Math.max(implied_value_usd,Math.round(quantile(values,.9)));
 const capital_usd=capitalOf(p),gas_usd=(3+Math.ceil(holdOf(age)/7))*10,total_cost_usd=capital_usd+gas_usd,breakeven_share=total_cost_usd/band_low_usd;
 return {...p,age_days:age,implied_value_usd,band_low_usd,band_high_usd,economics:{capital_usd,gas_usd,total_cost_usd,breakeven_share,verdict:breakeven_share<=model.farm.verdict_farm_max_share?'farm':breakeven_share<=model.farm.verdict_thin_max_share?'thin':'skip'},growth_multiplier:growth,maturity_multiplier:maturity,breadth_multiplier:breadth,farm_steps:farmPlan(p,age)};
 }).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||cmp(a.slug,b.slug));
 const board=rows.map((r,i)=>{const score=.5*(1-i/rows.length)+.3*clamp(((r.change_7d??0)+50)/100,0,1)+.2*(r.maturity_multiplier-.55)/.45;return {...r,rank:i+1,signal:{score,tier:score>=.75?'launch-ready':score>=.55?'warming-up':score>=.35?'early':'cooling'}};});
 const live=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.category!=='CEX').sort((a,b)=>b.mcap_usd!-a.mcap_usd!||cmp(a.slug,b.slug)).slice(0,24);
 const counts={scanned:s.protocols.length,pre_token:s.protocols.filter(pre).length,board:board.length,watchlist:s.watchlist.length,covered:s.watchlist.filter(slug=>board.some(r=>r.slug===slug)).length,live:live.length};
 return {board,radar:{as_of:s.as_of,source:s.source,floor_usd:s.floor_usd,model,model_version:'radar-3',counts,rows:board,live,comps:comps.map(p=>({...p,holdout:hash(p.slug)%5===0}))}};
}
export function boardIssue(board:any[],s:Snapshot):string|null{
 const slugs=new Set(board.map(r=>r.slug));if(slugs.size!==board.length)return 'Duplicate slug';
 if(s.watchlist.some(v=>!slugs.has(v)))return 'Watchlist coverage missing';
 if(board.length<2||new Set(board.map(r=>r.implied_value_usd)).size<2)return 'Values do not vary';
 for(let i=0;i<board.length;i++){const r=board[i];if(r.rank!==i+1)return 'Ranks not contiguous';if(!Number.isSafeInteger(r.implied_value_usd)||r.implied_value_usd<=0)return 'Invalid implied value';if(('band_low_usd' in r||'band_high_usd' in r)&&(!Number.isSafeInteger(r.band_low_usd)||!Number.isSafeInteger(r.band_high_usd)||r.band_low_usd<=0||r.band_low_usd>r.implied_value_usd||r.band_high_usd<r.implied_value_usd))return 'Invalid value band';if(i&&r.implied_value_usd>board[i-1].implied_value_usd)return 'Value order';if(!Array.isArray(r.farm_steps)||r.farm_steps.length<3||r.farm_steps.length>12||r.farm_steps.some((v:any)=>typeof v!=='string'||v.trim().length<20||v.trim().length>600))return 'Invalid farm plan';}return null;
}
export function dataScript(radar:unknown){return `window.RADAR=${JSON.stringify(radar)};\n`;}
