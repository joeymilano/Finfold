// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { authenticatedRequest, signIn } from './api';
let local: Record<string, unknown>, session: Record<string, unknown>;
const fetcher=vi.fn(), launch=vi.fn();
function storage(data:Record<string,unknown>) { return {get:async()=>({...data}),set:async(v:object)=>Object.assign(data,v),remove:async(key:string)=>{delete data[key];}}; }
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{vi.clearAllMocks();local={finfoldRefreshToken:'refresh'};session={finfoldReplyState:{body:'My edited reply'}};vi.stubGlobal('fetch',fetcher);vi.stubGlobal('chrome',{storage:{local:storage(local),session:storage(session)},identity:{launchWebAuthFlow:launch,getRedirectURL:()=> 'https://test.chromiumapp.org/finfold'}});});
afterEach(()=>vi.unstubAllGlobals());
it('stops login before opening OAuth when the backend is absent',async()=>{
 fetcher.mockResolvedValue(new Response('<html>404</html>',{status:404}));
 await expect(signIn()).rejects.toThrow('BACKEND_NOT_DEPLOYED');expect(launch).not.toHaveBeenCalled();
});
it('shares token rotation between concurrent API calls',async()=>{
 fetcher.mockImplementation(async(url:string)=> url.endsWith('/token') ? json({accessToken:'new-access',refreshToken:'new-refresh'}) : json({ok:true}));
 await Promise.all([authenticatedRequest('/first',{}),authenticatedRequest('/second',{})]);
 expect(fetcher.mock.calls.filter(([url])=>String(url).endsWith('/token'))).toHaveLength(1);
 expect(local.finfoldRefreshToken).toBe('new-refresh');
 expect(fetcher.mock.calls.filter(([url])=>!String(url).endsWith('/token')).every(([,init])=>init.headers.get('Authorization')==='Bearer new-access')).toBe(true);
});
it('preserves login and edited draft after a transient token-refresh failure',async()=>{
 fetcher.mockRejectedValue(new TypeError('Failed to fetch'));
 await expect(authenticatedRequest('/first',{})).rejects.toThrow('Failed to fetch');
 expect(local.finfoldRefreshToken).toBe('refresh');expect(session.finfoldReplyState).toEqual({body:'My edited reply'});
 fetcher.mockImplementation(async(url:string)=>url.endsWith('/token')?json({accessToken:'recovered',refreshToken:'rotated'}):json({ok:true}));
 await expect(authenticatedRequest('/first',{})).resolves.toEqual({ok:true});
});
it('clears revoked credentials and account-bound draft on invalid grant',async()=>{
 fetcher.mockImplementation(async(url:string)=>url.endsWith('/token')?json({error:{code:'INVALID_GRANT'}},401):json({ok:true}));
 await expect(authenticatedRequest('/first',{})).rejects.toThrow('INVALID_GRANT');
 expect(local.finfoldRefreshToken).toBeUndefined();expect(session.finfoldReplyState).toBeUndefined();
});
it('rejects HTML server errors without exposing parser errors',async()=>{
 session.finfoldAccessToken='access';fetcher.mockResolvedValue(new Response('<html>Bad gateway</html>',{status:502}));
 await expect(authenticatedRequest('/first',{})).rejects.toThrow('INVALID_SERVER_RESPONSE');
});
