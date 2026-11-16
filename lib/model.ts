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
/* radar-2: median live mcap/TVL within [0.02,10], fallback .25 below 10 samples.
   Value = round(TVL * median * (1+.5*tanh(7d/50)) * maturity * breadth), min $1.
   maturity=.55+.45*ln(1+min(age,1095))/ln(1096); unknown age=365.
   breadth=1+.05*min(max(chainCount-1,0),5). No name-specific adjustments.
   Signal=.5*(1-(rank-1)/N)+.3*clamp((7d+50)/100,0,1)+.2*(maturity-.55)/.45.
   Tiers .75 launch-ready, .55 warming-up, .35 early, otherwise cooling.
*/
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
 const capital=p.tvl_usd>=1e9?250:p.tvl_usd>=1e8?150:p.tvl_usd>=1e7?100:50;
 const hold=age<180?90:age<365?60:30; const chain=p.chains[0]??'the supported main chain';
 const variant=(i:number,a:string[])=>a[hash(p.slug+':'+i)%a.length];
 const step=(a:string,c:string,t:string)=>`${a.replace(/[. ]+$/,'')}. Cost: ${c}. Time: ${t}.`.trim().slice(0,600);
 const steps=[
 step(variant(0,['Create a fresh farming wallet and store its seed offline; verify a small test transfer','Set up a fresh wallet, keep the seed offline and test the receiving address','Isolate farming funds in a fresh wallet with its recovery seed stored offline']),'$0 setup; reserve $3–$15 native gas','10 minutes'),
 step(action(p,chain,capital)+variant(1,['; inspect fees and withdrawal terms before confirming','; use the smallest supported position and record the receipt','; confirm the asset and contract in the protocol app']),`$${capital} capital at risk plus estimated $3–$15 gas`,'15 minutes'),
 step(variant(2,['Perform one qualifying core action each week; verify eligibility in the protocol rules','Return weekly for one eligible core action and keep transaction receipts','Complete one qualifying action every week; avoid artificial volume']), 'estimated $2–$10 gas per week; fees vary','10 minutes weekly'),
 step(variant(3,[`Hold the position for ${hold} days; review solvency and exit conditions weekly`,`Maintain the position across a ${hold}-day window, checking risk each week`,`Keep funds deployed for ${hold} days while monitoring withdrawal availability`]),`$${capital} remains exposed to protocol and asset risk`,`${hold} days`),
 step(p.chains.length>=2?action(p,p.chains[1],capital)+variant(4,['; treat this as a separate allocation','; check bridge and chain risk first','; keep a separate transaction receipt']):variant(4,[`Check ${p.name}'s own points or rewards page for eligibility and snapshot rules`,`Review the points and snapshot criteria published by ${p.name}`,`Read ${p.name}'s own rewards page and note qualifying snapshot dates`]),p.chains.length>=2?`additional $${capital} capital plus estimated $3–$15 gas`:'$0 to check','10–15 minutes'),
 step(variant(5,['Claim only from links the protocol itself publishes; never pay to claim; record wallet, dates and receipts in a farm log','Keep a farm log of capital and transactions; claim only through protocol-published links and never pay to claim','Log receipts, fees and exit dates; use only claim links published by the protocol itself and never pay to claim']),'$0 to check; legitimate network gas may apply','5 minutes per review')];
 const n=5+hash(p.slug)%3;
 // Vary length by omitting the optional route/points step, never by merging actions.
 // The core action, weekly cadence, hold window and safety/log step remain intact.
 if(n===5)steps.splice(4,1);
 if(n===7)steps.push(step(variant(6,['Rehearse the exit with a small withdrawal before increasing exposure','Test a small withdrawal and reconcile the result against your farm log','Review the exit route and test redemption before committing more capital']), 'estimated $2–$10 gas; no extra capital required','10 minutes'));
 if(steps.some(s=>s.length<20||s.length>600))throw new Error('Invalid generated plan');return steps;
}
export function buildRadar(s:Snapshot){
 const ratios=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.tvl_usd>0).map(p=>p.mcap_usd!/p.tvl_usd).filter(x=>x>=.02&&x<=10).sort((a,b)=>a-b);
 const n=ratios.length;const calibratedMultiple=n<10?.25:n%2?ratios[(n-1)/2]:(ratios[n/2-1]+ratios[n/2])/2;
 const model={calibratedMultiple,calibration_samples:n,ratio_min:.02,ratio_max:10,fallback:.25,growth_weight:.5,growth_scale:50,maturity_floor:.55,maturity_range:.45,maturity_days:1095,unknown_age_days:365,breadth_step:.05,breadth_cap:5};
 const rows=s.protocols.filter(isRankable).map(p=>{
 const age=ageOf(p,s),growth=1+.5*Math.tanh((p.change_7d??0)/50),maturity=.55+.45*Math.log1p(Math.min(age,1095))/Math.log1p(1095),breadth=1+.05*Math.min(Math.max(p.chains.length-1,0),5);
 return {...p,age_days:age,implied_value_usd:Math.max(1,Math.round(p.tvl_usd*calibratedMultiple*growth*maturity*breadth)),growth_multiplier:growth,maturity_multiplier:maturity,breadth_multiplier:breadth,farm_steps:farmPlan(p,age)};
 }).sort((a,b)=>b.implied_value_usd-a.implied_value_usd||cmp(a.slug,b.slug));
 const board=rows.map((r,i)=>{const score=.5*(1-i/rows.length)+.3*clamp(((r.change_7d??0)+50)/100,0,1)+.2*(r.maturity_multiplier-.55)/.45;return {...r,rank:i+1,signal:{score,tier:score>=.75?'launch-ready':score>=.55?'warming-up':score>=.35?'early':'cooling'}};});
 const live=s.protocols.filter(p=>(p.mcap_usd??0)>0&&p.category!=='CEX').sort((a,b)=>b.mcap_usd!-a.mcap_usd!||cmp(a.slug,b.slug)).slice(0,24);
 const counts={scanned:s.protocols.length,pre_token:s.protocols.filter(pre).length,board:board.length,watchlist:s.watchlist.length,covered:s.watchlist.filter(slug=>board.some(r=>r.slug===slug)).length,live:live.length};
 return {board,radar:{as_of:s.as_of,source:s.source,floor_usd:s.floor_usd,model,model_version:'radar-2',counts,rows:board,live}};
}
export function boardIssue(board:any[],s:Snapshot):string|null{
 const slugs=new Set(board.map(r=>r.slug));if(slugs.size!==board.length)return 'Duplicate slug';
 if(s.watchlist.some(v=>!slugs.has(v)))return 'Watchlist coverage missing';
 if(board.length<2||new Set(board.map(r=>r.implied_value_usd)).size<2)return 'Values do not vary';
 for(let i=0;i<board.length;i++){const r=board[i];if(r.rank!==i+1)return 'Ranks not contiguous';if(!Number.isSafeInteger(r.implied_value_usd)||r.implied_value_usd<=0)return 'Invalid implied value';if(i&&r.implied_value_usd>board[i-1].implied_value_usd)return 'Value order';if(!Array.isArray(r.farm_steps)||r.farm_steps.length<3||r.farm_steps.length>12||r.farm_steps.some((v:any)=>typeof v!=='string'||v.trim().length<20||v.trim().length>600))return 'Invalid farm plan';}return null;
}
export function dataScript(radar:unknown){return `window.RADAR=${JSON.stringify(radar)};\n`;}
