const QUOTES=['USD','GBP','EUR','CAD','AUD','AED','SGD'];
export function createExchangeRateService({fetcher=fetch,now=Date.now}={}){
 let cached,inFlight;
 return async function latest(){
  if(cached&&now()-cached.fetchedAt<3600000)return {...cached.payload,stale:false};
  if(inFlight)return inFlight;
  inFlight=(async()=>{
   try{
    const response=await fetcher(`https://api.frankfurter.dev/v2/rates?base=INR&quotes=${QUOTES.join(',')}`,{signal:AbortSignal.timeout(6000)});
    if(!response.ok)throw Error('Rate provider unavailable');
    const rows=await response.json(),rates={INR:1},dates={};
    if(!Array.isArray(rows))throw Error('Invalid rates');
    for(const quote of QUOTES){
     const row=rows.find(r=>r.base==='INR'&&r.quote===quote);
     if(!row||typeof row.rate!=='number'||!Number.isFinite(row.rate)||row.rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))throw Error('Invalid rates');
     rates[quote]=row.rate;dates[quote]=row.date;
    }
    const fetchedAt=now();
    cached={fetchedAt,payload:{base:'INR',rates,dates,fetched_at:new Date(fetchedAt).toISOString(),source:'Frankfurter',frequency:'daily'}};
    return {...cached.payload,stale:false};
   }catch(error){if(cached)return {...cached.payload,stale:true};throw error}
   finally{inFlight=null}
  })();
  return inFlight;
 };
}
const latest=createExchangeRateService();
export async function exchangeRatesResponse(){
 try{return Response.json(await latest(),{headers:{'Cache-Control':'private, no-store'}})}
 catch{return Response.json({error:'Exchange rates are temporarily unavailable. INR amounts remain available.'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
