const fs=require('node:fs')
// Bounded read-only exercise on the exact local fixture. Never accepts a remote URL.
module.exports=async function localLoad({ ctx, origin, shopId, ownerToken }) {
  if(origin!=='https://app.storely.localhost'||!shopId.startsWith('platform-shop-')) throw new Error('Only the local fixture is allowed')
  const routes=['/v1/me','/v1/shops',`/v1/shops/${shopId}/entitlement`,`/v1/shops/${shopId}/products?limit=25`]
  const concurrency=4, count=100, latencies=[], failures=[]
  let next=0
  const started=performance.now()
  await Promise.all(Array.from({length:concurrency},async()=>{
    while(next<count) {
      const i=next++
      const path=routes[i%routes.length]
      const begin=performance.now()
      try {
        const result=await ctx.request.get(origin+path,{headers:{Authorization:`Bearer ${ownerToken}`},timeout:10000})
        await result.body()
        latencies.push(performance.now()-begin)
        if(result.status()!==200) failures.push(result.status())
      } catch { failures.push('network') }
    }
  }))
  latencies.sort((a,b)=>a-b)
  const duration=performance.now()-started
  const percentile=p=>Math.round(latencies[Math.max(0,Math.ceil(p*latencies.length)-1)]||0)
  const report={recorded_at:new Date().toISOString(),environment:'local-compose TLS',requests:count,concurrency,failures:failures.length,
    duration_ms:Math.round(duration),requests_per_second:Math.round(count/(duration/1000)*100)/100,
    response_ms:{p50:percentile(.5),p95:percentile(.95),max:percentile(1)},
    scope:'authenticated metadata/catalogue reads on development fixture; not production capacity or write/sync stress',
    acceptance:{zero_failures:failures.length===0,p95_under_5000ms:percentile(.95)<5000}}
  fs.writeFileSync('/shots/local-load.json',JSON.stringify(report,null,2)+'\n')
  if(failures.length||percentile(.95)>=5000) throw new Error(`Local load gate failed: ${failures.length} failures, p95 ${percentile(.95)}ms`)
  process.stdout.write(`PASS local TLS read load: ${count} requests / ${concurrency} concurrent, p95 ${percentile(.95)}ms, zero failures\n`)
}
