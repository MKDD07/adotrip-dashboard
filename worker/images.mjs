const searches = new Map();
const TTL = 86400000;
const allowedImage = value => { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'images.pexels.com'; } catch { return false; } };
const allowedPage = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['www.pexels.com','pexels.com'].includes(u.hostname); } catch { return false; } };
const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': status === 200 ? 'public, max-age=86400' : 'no-store' } });
export async function imageSearch(request, env, context, upstream = fetch) {
  const url = new URL(request.url), query = (url.searchParams.get('query') || '').trim().replace(/\s+/g,' '), target = (url.searchParams.get('target') || '').trim();
  if (!query || query.length > 120 || !target || target.length > 100) return response({ error: 'An image target and a query of up to 120 characters are required' }, 400);
  if (!env.PEXELS_API_KEY) return response({ error: 'Pexels images are unavailable until PEXELS_API_KEY is configured on the Worker' }, 503);
  const portrait = ['person','profile','avatar','account'].includes(url.searchParams.get('kind'));
  const cacheKey = `${portrait ? 'portrait' : 'landscape'}:${query.toLowerCase()}`;
  const edgeKey = new Request(`${url.origin}/__pexels_cache?query=${encodeURIComponent(cacheKey)}`);
  const edge = globalThis.caches?.default;
  try {
    let entry = searches.get(cacheKey);
    if (!entry || entry.expires < Date.now()) {
      const promise = (async () => {
        const cached = edge && await edge.match(edgeKey);
        if (cached) return cached.json();
        const apiUrl = new URL('https://api.pexels.com/v1/search');
        apiUrl.search = new URLSearchParams({ query, per_page: '20', orientation: portrait ? 'portrait' : 'landscape', locale: 'en-US' }).toString();
        const result = await upstream(apiUrl, { headers: { Authorization: env.PEXELS_API_KEY }, signal: AbortSignal.timeout(10000) });
        if (!result.ok) throw new Error(result.status === 429 ? 'Pexels image quota reached. Try again later.' : result.status === 401 ? 'Pexels API key is invalid.' : 'Pexels image search is temporarily unavailable.');
        const payload = await result.json();
        const photos = (payload.photos || []).map(p => ({ id: p.id, image: p.src?.[portrait ? 'portrait' : 'landscape'], thumbnail: p.src?.small, alt: p.alt, photographer: p.photographer, url: p.url, color: p.avg_color })).filter(p => allowedImage(p.image) && allowedPage(p.url));
        if (edge && photos.length) { const save = edge.put(edgeKey, response(photos)); if (context?.waitUntil) context.waitUntil(save); else await save; }
        return photos;
      })();
      entry = { expires: Date.now() + TTL, promise };searches.set(cacheKey,entry);
      if(searches.size>100)searches.delete(searches.keys().next().value);
    }
    const photos = await entry.promise;
    if (!photos.length) { searches.delete(cacheKey); return response({ error: 'No matching Pexels photos found' }, 404); }
    let hash=0;for(const c of target)hash=(hash*31+c.charCodeAt(0))>>>0;
    return response({ target, query, ...photos[hash % photos.length], illustrative: true });
  } catch(error) { searches.delete(cacheKey); return response({ error: error.message || 'Image search failed' }, 502); }
}

export async function serveStockPhoto(request,env,context,upstream=fetch){
 if(!env.MEDIA)return response({error:'R2 photo storage is not connected'},503);
 const found=await imageSearch(request,env,context,upstream);if(!found.ok)return found;
 const photo=await found.json(),url=new URL(request.url),kind=['person','profile','avatar','account'].includes(url.searchParams.get('kind'))?'portrait':'landscape',key=`stock/${kind}/${photo.id}`;
 try{
  let object=await env.MEDIA.get(key);
  if(!object){
   const fetched=await upstream(photo.image,{signal:AbortSignal.timeout(15000)});const mime=(fetched.headers.get('Content-Type')||'').split(';')[0];
   if(!fetched.ok||!['image/jpeg','image/png','image/webp'].includes(mime))return response({error:'Photo could not be loaded'},502);
   if(Number(fetched.headers.get('Content-Length'))>8*1024*1024)return response({error:'Photo is too large'},413);
   const bytes=await fetched.arrayBuffer();if(bytes.byteLength>8*1024*1024)return response({error:'Photo is too large'},413);
   await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:mime}});object=await env.MEDIA.get(key);
  }
  if(!object)return response({error:'Photo is unavailable'},404);
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);headers.set('Cache-Control','public, max-age=86400');headers.set('X-Content-Type-Options','nosniff');
  if(url.searchParams.get('download')==='1'){const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[headers.get('Content-Type')]||'jpg';headers.set('Content-Disposition',`attachment; filename="photo-${photo.id}.${ext}"`)}
  return new Response(object.body,{headers});
 }catch{return response({error:'Photo storage is temporarily unavailable'},502)}
}
