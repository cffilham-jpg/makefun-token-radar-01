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
// Robust cross-sectional fit. All folds and resamples refit both curve and families.
const median=(xs:number[])=>quantile(xs,.5);
function quantile(xs:number[],q:number){const a=[...xs].sort((a,b)=>a-b);if(!a.length)return 0;const i=(a.length-1)*q,l=Math.floor(i);return a[l]+(a[Math.ceil(i)]-a[l])*(i-l);}
export function familyOf(category:string|null){const c=category??'';return /lend|cdp/i.test(c)?'Lending & CDP':/dex|trad|deriv|perp|prediction/i.test(c)?'Trading':/yield|farm|vault|curator|allocator|restak/i.test(c)?'Vaults & yield':/rwa|stable/i.test(c)?'RWA & stables':/stak/i.test(c)?'Staking':/bridge|chain|infra|liquid/i.test(c)?'Infra & chains':'Other';}
const familyNames=['Infra & chains','Lending & CDP','Other','RWA & stables','Staking','Trading','Vaults & yield'];
function fitCurve(ps:Protocol[],multiple:number){
 const n=ps.length,x=ps.map(p=>Math.log(p.tvl_usd)),y=ps.map(p=>Math.log(p.mcap_usd!));
 let weights=x.map(()=>1),slope=1,intercept=Math.log(multiple);
 for(let iter=0;iter<=3;iter++){
  const sw=weights.reduce((a,b)=>a+b,0),mx=x.reduce((a,v,i)=>a+v*weights[i],0)/sw,my=y.reduce((a,v,i)=>a+v*weights[i],0)/sw;
  slope=x.reduce((a,v,i)=>a+weights[i]*(v-mx)*(y[i]-my),0)/x.reduce((a,v,i)=>a+weights[i]*(v-mx)**2,0);intercept=my-slope*mx;
  if(iter<3){const residual=y.map((v,i)=>v-intercept-slope*x[i]),center=median(residual),scale=Math.max(1e-9,1.4826*median(residual.map(r=>Math.abs(r-center))));weights=residual.map(r=>Math.min(1,1.345*scale/Math.abs(r)));}
 }
 if(n<10||slope<=0||!Number.isFinite(slope)||!Number.isFinite(intercept)){slope=1;intercept=Math.log(multiple);}
 const mean=y.reduce((a,b)=>a+b,0)/n,total=y.reduce((a,v,i)=>a+weights[i]*(v-mean)**2,0),error=y.reduce((a,v,i)=>a+weights[i]*(v-intercept-slope*x[i])**2,0);
 return {slope,intercept,r2:total>0?1-error/total:0,n,method:'huber-log-log-ols',huber_c:1.345,huber_iters:3};
}
function multipleOf(ps:Protocol[]){return ps.length<10?.25:median(ps.map(p=>p.mcap_usd!/p.tvl_usd));}
function fitted(ps:Protocol[]){const fit=fitCurve(ps,multipleOf(ps));const families=familyNames.map(family=>{const members=ps.filter(p=>familyOf(p.category)===family),offset=members.reduce((sum,p)=>sum+Math.log(p.mcap_usd!)-fit.intercept-fit.slope*Math.log(p.tvl_usd),0)/(members.length+8);return {family,n:members.length,offset,multiple:Math.exp(offset)};});return {fit,families};}
function priors(p:Protocol,s:Snapshot){const age=ageOf(p,s);return {growth:1+.25*Math.tanh((p.change_7d??0)/50),maturity:.85+.15*Math.log1p(Math.min(age,1095))/Math.log1p(1095),breadth:1+.02*Math.min(Math.max(p.chains.length-1,0),5)};}
function predicted(p:Protocol,s:Snapshot,f:ReturnType<typeof fitted>,mode='full'){const offset=mode==='curve'?0:f.families.find(v=>v.family===familyOf(p.category))!.offset;const a=priors(p,s);return Math.exp(f.fit.intercept+f.fit.slope*Math.log(p.tvl_usd)+offset)*(mode==='full'?a.growth*a.maturity*a.breadth:1);}
function ranks(xs:number[]){return xs.map(v=>{const less=xs.filter(x=>x<v).length,equal=xs.filter(x=>x===v).length;return less+(equal+1)/2;});}
function spearman(a:number[],b:number[]){const x=ranks(a),y=ranks(b),mx=x.reduce((a,b)=>a+b,0)/x.length,my=y.reduce((a,b)=>a+b,0)/y.length;const cov=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0);return cov/Math.sqrt(x.reduce((s,v)=>s+(v-mx)**2,0)*y.reduce((s,v)=>s+(v-my)**2,0))||0;}
function evaluate(train:Protocol[],test:Protocol[],s:Snapshot){const f=fitted(train),errors=test.map(p=>Math.abs(Math.log(p.mcap_usd!)-Math.log(predicted(p,s,f))));return {n_test:test.length,median_abs_log_error:test.length?median(errors):null,within_factor_2:test.length?errors.filter(e=>e<=Math.log(2)).length/test.length:null};}
function leaveOneOut(comps:Protocol[],s:Snapshot){const result:any={};for(const mode of ['flat','curve','family','full']){const actual:number[]=[],pred:number[]=[];comps.forEach((p,i)=>{const train=comps.filter((_,j)=>i!==j),f=fitted(train);actual.push(p.mcap_usd!);pred.push(mode==='flat'?multipleOf(train)*p.tvl_usd:predicted(p,s,f,mode));});const errors=pred.map((v,i)=>Math.abs(Math.log(v/actual[i])));result[mode]={n:comps.length,median_miss:Math.exp(median(errors)),mean_abs_log_error:errors.reduce((a,b)=>a+b,0)/errors.length,within_factor_3:errors.filter(e=>e<=Math.log(3)).length/errors.length,spearman:spearman(pred,actual)};}return result;}
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
 const capital=capitalOf(p),hold=holdOf(age),gas=(3+Math.ceil(hold/7))*10,total=capital+gas,stop=Math.round(.9*p.tvl_usd);
 const steps:string[]=[],when:string[]=[],minutes:number[]=[];
 const add=(text:string,cost:string,time:number,label:string)=>{steps.push(`${text}. Cost: ${cost}. Time: ${time} minutes.`);when.push(label);minutes.push(time);};
 add('Create a fresh wallet; store its seed offline and verify the receiving address','$0 setup',10,'day 0');
 add(action(p,p.chains[0]??'the supported main chain',capital)+'; verify contracts and withdrawal terms',`$${capital} capital; $10 planned gas`,15,'day 0');
 add(`Budget $${total} total planned spend: $${capital} capital plus $${gas} gas at $10 per action; keep a receipt and fee log`,'$0 planning',10,'day 0');
 add(`Set a stop level: exit if TVL closes under $${stop.toLocaleString('en-US')} (90% of current TVL); check withdrawal liquidity before entering`,'$0 review',5,'day 0');
 add(`Check weekly over ${hold} days; compare TVL with the stop level, review solvency and perform one eligible core action; log receipts`,'$10 gas per weekly action',10,'weekly');
 add(p.chains.length>1?`Inspect ${p.name} on ${p.chains[1]}; reallocate existing funds only if a second-chain route fits the budget`:`Read ${p.name} points and eligibility rules; record requirements without assuming a reward`,'$0 research',10,'weekly');
 add('Rehearse the exit with a small test withdrawal; reconcile recovered capital and fees in the log','$10 planned gas',10,`day ${hold}`);
 if(hash(p.slug)%2)add('Review logged costs; pause if eligibility, fees or withdrawal terms have changed','$0 review',5,`day ${hold}`);
 add('Use protocol-published links only; never pay to claim; revoke unneeded permissions and retain receipts','$0 review; future claim gas excluded',5,`day ${hold}`);
 if(steps.some(v=>v.length<20||v.length>600))throw Error('Invalid generated plan');
 return {steps,when,hands_on_minutes:minutes.reduce((a,b)=>a+b,0)};
}
export function buildRadar(s:Snapshot){
 const comps=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.tvl_usd>0&&p.category!=='CEX'&&p.mcap_usd!/p.tvl_usd>=.02&&p.mcap_usd!/p.tvl_usd<=10);
 const calibratedMultiple=multipleOf(comps),full=fitted(comps),{fit,families}=full;
 const dated=comps.filter(p=>p.listed_at!==null),cut=median(dated.map(p=>day(p.listed_at!)));
 const oos={holdout:evaluate(comps.filter(p=>hash(p.slug)%5!==0),comps.filter(p=>hash(p.slug)%5===0),s),time_split:evaluate(dated.filter(p=>day(p.listed_at!)<=cut),dated.filter(p=>day(p.listed_at!)>cut),s)};
 const random=mulberry32(0x52414433),fits=Array.from({length:200},()=>{const sample=Array.from({length:comps.length},()=>comps[Math.floor(random()*comps.length)]);return fitted(sample);});
 const bootstrap={resamples:200,slope_p10:quantile(fits.map(f=>f.fit.slope),.1),slope_p90:quantile(fits.map(f=>f.fit.slope),.9),intercept_p10:quantile(fits.map(f=>f.fit.intercept),.1),intercept_p90:quantile(fits.map(f=>f.fit.intercept),.9)};
 const model={calibratedMultiple,calibration_samples:comps.length,fit,families,loo:leaveOneOut(comps,s),oos,bootstrap,ratio_min:.02,ratio_max:10,fallback:.25,growth_weight:.25,growth_scale:50,maturity_floor:.85,maturity_range:.15,maturity_days:1095,unknown_age_days:365,breadth_step:.02,breadth_cap:5,farm:{gas_per_action_usd:10,verdict_farm_max_share:.00003,verdict_thin_max_share:.00009,airdrop_share_assumption:.10}};
 const rows=s.protocols.filter(isRankable).map(p=>{
 const age=ageOf(p,s),{growth,maturity,breadth}=priors(p,s),family=familyOf(p.category),family_offset=families.find(f=>f.family===family)!.offset;
 const value=(f:ReturnType<typeof fitted>)=>Math.max(1,Math.round(predicted(p,s,f)));
 const implied_value_usd=value(full),values=fits.map(value),band_low_usd=Math.min(implied_value_usd,Math.max(1,Math.round(quantile(values,.1)))),band_high_usd=Math.max(implied_value_usd,Math.round(quantile(values,.9)));
 const peers=comps.filter(c=>familyOf(c.category)===family).sort((a,b)=>Math.abs(Math.log(a.tvl_usd/p.tvl_usd))-Math.abs(Math.log(b.tvl_usd/p.tvl_usd))||cmp(a.slug,b.slug)).slice(0,3).map(c=>({slug:c.slug,name:c.name,tvl_usd:c.tvl_usd,mcap_usd:c.mcap_usd,ratio:c.mcap_usd!/c.tvl_usd}));
 const plan=farmPlan(p,age);
 const capital_usd=capitalOf(p),gas_usd=(3+Math.ceil(holdOf(age)/7))*10,total_cost_usd=capital_usd+gas_usd,breakeven_share=total_cost_usd/band_low_usd;
 const slice_usd=.10*implied_value_usd*capital_usd/p.tvl_usd,net_usd=slice_usd-total_cost_usd;
 return {...p,watchlist:s.watchlist.includes(p.slug),family,family_offset,family_multiple:Math.exp(family_offset),peers,farm_when:plan.when,age_days:age,implied_value_usd,band_low_usd,band_high_usd,economics:{slice_usd,net_usd,breakeven_odds:slice_usd>0?Math.min(1,total_cost_usd/slice_usd):1,hands_on_minutes:plan.hands_on_minutes,net_per_hour_usd:net_usd/Math.max(plan.hands_on_minutes/60,1/60),capital_usd,gas_usd,total_cost_usd,breakeven_share,verdict:breakeven_share<=model.farm.verdict_farm_max_share?'farm':breakeven_share<=model.farm.verdict_thin_max_share?'thin':'skip'},growth_multiplier:growth,maturity_multiplier:maturity,breadth_multiplier:breadth,farm_steps:plan.steps};
 }).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||cmp(a.slug,b.slug));
 const board=rows.map((r,i)=>{const score=.5*(1-i/rows.length)+.3*clamp(((r.change_7d??0)+50)/100,0,1)+.2*((.55+.45*Math.log1p(Math.min(r.age_days,1095))/Math.log1p(1095))-.55)/.45;return {...r,rank:i+1,signal:{score,tier:score>=.75?'launch-ready':score>=.55?'warming-up':score>=.35?'early':'cooling'}};});
 const live=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.category!=='CEX').sort((a,b)=>b.mcap_usd!-a.mcap_usd!||cmp(a.slug,b.slug)).slice(0,24);
 const counts={scanned:s.protocols.length,pre_token:s.protocols.filter(pre).length,board:board.length,watchlist:s.watchlist.length,covered:s.watchlist.filter(slug=>board.some(r=>r.slug===slug)).length,live:live.length};
 const accounting={scanned:s.protocols.length,ranked:0,token_record:0,excluded_category:0,wrapped_or_staked_name:0,exchange_name:0,versioned_name:0};
 for(const p of s.protocols){const key=!pre(p)?'token_record':['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX'].includes(p.category??'')?'excluded_category':/\b(wrapped|staked|staking)\b/i.test(p.name)?'wrapped_or_staked_name':/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i.test(p.name)?'exchange_name':/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)?'versioned_name':'ranked';accounting[key]++;}
 if(Object.entries(accounting).filter(([k])=>k!=='scanned').reduce((n,[,v])=>n+v,0)!==accounting.scanned)throw Error('Accounting mismatch');
 return {board,radar:{as_of:s.as_of,source:s.source,floor_usd:s.floor_usd,model,model_version:'radar-4',accounting,counts,rows:board,live,comps:comps.map(p=>({...p,holdout:hash(p.slug)%5===0}))}};
}
export function boardIssue(board:any[],s:Snapshot):string|null{
 const slugs=new Set(board.map(r=>r.slug));if(slugs.size!==board.length)return 'Duplicate slug';
 if(s.watchlist.some(v=>!slugs.has(v)))return 'Watchlist coverage missing';
 if(board.length<2||new Set(board.map(r=>r.implied_value_usd)).size<2)return 'Values do not vary';
 for(let i=0;i<board.length;i++){const r=board[i];if(r.rank!==i+1)return 'Ranks not contiguous';if(!Number.isSafeInteger(r.implied_value_usd)||r.implied_value_usd<=0)return 'Invalid implied value';if(('band_low_usd' in r||'band_high_usd' in r)&&(!Number.isSafeInteger(r.band_low_usd)||!Number.isSafeInteger(r.band_high_usd)||r.band_low_usd<=0||r.band_low_usd>r.implied_value_usd||r.band_high_usd<r.implied_value_usd))return 'Invalid value band';if(i&&r.implied_value_usd>board[i-1].implied_value_usd)return 'Value order';if(!Array.isArray(r.farm_steps)||r.farm_steps.length<3||r.farm_steps.length>12||r.farm_steps.some((v:any)=>typeof v!=='string'||v.trim().length<20||v.trim().length>600))return 'Invalid farm plan';}return null;
}
export function dataScript(radar:unknown){return `window.RADAR=${JSON.stringify(radar)};\n`;}
