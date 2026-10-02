// @vitest-environment node
import { expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Explicit opt-in: uses the named pilot account, a real database and real model.
// One successful generation costs 3 Credits. Test sessions are always revoked.
it.skipIf(process.env.FINFOLD_EXTENSION_PILOT_LIVE !== '1')('verifies PKCE, account gates, real generation, replay and failure refund',async()=>{
 if(process.env.FINFOLD_REPLY_ENV_FILE) process.loadEnvFile(process.env.FINFOLD_REPLY_ENV_FILE);
 const userId=process.env.FINFOLD_EXTENSION_PILOT_TEST_USER_ID;
 if(!userId) throw new Error('A specific pilot account is required');
 const origin='chrome-extension://gebbcemokglolnbocggbefmkjkfkcfhe';
 Object.assign(process.env,{FINFOLD_EXTENSION_AUTH_ENABLED:'true',FINFOLD_EXTENSION_PAID_ACTIONS_ENABLED:'true',FINFOLD_EXTENSION_REPLY_DRAFTS_ENABLED:'true',FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS:userId,FINFOLD_EXTENSION_ORIGINS:origin});
 const stage=(name:string)=>console.info('[pilot]',name);
 const fetchActual=globalThis.fetch;
 globalThis.fetch=async (...args:Parameters<typeof fetch>)=>{const started=Date.now();const response=await fetchActual(...args);console.info('[pilot network]',new URL(typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url).pathname,response.status,Date.now()-started);return response;};
 stage('PKCE');
 const oauth=await import('@/lib/extension/oauth');
 const {POST}=await import('@/app/api/extension/v1/reply-drafts/route');
 const {GET}=await import('@/app/api/extension/v1/session/route');
 const {getAvailableCredits}=await import('@/lib/payment');
 const {createSupabaseAdminClient}=await import('@/lib/supabase');
 const redirectUri='https://gebbcemokglolnbocggbefmkjkfkcfhe.chromiumapp.org/finfold';
 const verifier=randomBytes(48).toString('base64url');
 const code=await oauth.createAuthorizationCode({userId,redirectUri,codeChallenge:createHash('sha256').update(verifier).digest('base64url')});
 expect(await oauth.exchangeAuthorizationCode({code,redirectUri,codeVerifier:'wrong'.repeat(12)})).toBeNull();
 let tokens=await oauth.exchangeAuthorizationCode({code,redirectUri,codeVerifier:verifier});
 expect(Boolean(tokens)).toBe(true);if(!tokens) throw new Error('PKCE exchange failed');
 const report: Record<string,unknown>={testedAt:new Date().toISOString(),mode:'local route handlers with production database and real model',syntheticTestInputs:true};
 const headers=()=>({origin,authorization:`Bearer ${tokens!.accessToken}`,'content-type':'application/json'});
 const request=(body:object)=>new Request('https://www.finfold.app/api/extension/v1/reply-drafts',{method:'POST',headers:headers(),body:JSON.stringify(body)});
 try {
  expect(await oauth.exchangeAuthorizationCode({code,redirectUri,codeVerifier:verifier})).toBeNull();
  stage('Refresh');
  const previousRefresh=tokens.refreshToken;
  const refreshed=await oauth.refreshExtensionSession(previousRefresh);expect(Boolean(refreshed)).toBe(true);
  if(!refreshed) throw new Error('Refresh failed');tokens=refreshed;
  expect(await oauth.refreshExtensionSession(previousRefresh)).toBeNull();
  stage('Session');
  const sessionResponse=await GET(new Request('https://www.finfold.app/api/extension/v1/session',{headers:headers()}));
  const session=await sessionResponse.json();expect(session.userId).toBe(userId);expect(session.replyDraftsEnabled).toBe(true);
  const before=await getAvailableCredits(userId);
  const body={requestId:process.env.FINFOLD_EXTENSION_PILOT_REPLAY_REQUEST_ID || crypto.randomUUID(),platform:'linkedin',language:'en',comment:'How does the reply assistant work?',postContext:'Finfold prepares a suggested reply for the author to review, edit and copy. The author sends it manually.'};
  stage('Generate or resume');
  const generated=await POST(request(body));expect(generated.status).toBe(200);
  const first=await generated.json();expect(first.result.status).toBe('draft');expect(first.result.body.length).toBeGreaterThan(10);
  const after=await getAvailableCredits(userId);expect(before-after).toBe(process.env.FINFOLD_EXTENSION_PILOT_REPLAY_REQUEST_ID ? 0 : 3);
  stage('Replay');
  const replay=await POST(request(body));expect(replay.status).toBe(200);expect((await replay.json()).result).toEqual(first.result);
  expect(await getAvailableCredits(userId)).toBe(after);
  stage('Conflict and pilot gate');
  const conflict=await POST(request({...body,comment:'Changed input'}));expect(conflict.status).toBe(409);
  process.env.FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS='';
  expect((await POST(request({...body,requestId:crypto.randomUUID()}))).status).toBe(403);
  process.env.FINFOLD_EXTENSION_REPLY_PILOT_USER_IDS=userId;
  stage('Failure refund');
  Object.assign(process.env,{LLM_API_KEY:'',LLM_PROVIDERS:'[]'});
  const failedId=crypto.randomUUID();const failed=await POST(request({...body,requestId:failedId}));expect(failed.status).toBe(502);
  expect(await getAvailableCredits(userId)).toBe(after);
  const db=createSupabaseAdminClient()!;
  const {data:ledger,error}=await db.from('ai_usage_operations').select('status').eq('user_id',userId).eq('operation_key',`extension-reply:${userId}:${failedId}`).single();
  expect(error).toBeNull();expect(ledger?.status).toBe('refunded');
  Object.assign(report,{pkceSingleUse:true,refreshRotation:true,accountGate:true,result:first.result,creditsChargedThisRun:before-after,reusedRequestId:body.requestId,replayCharged:0,changedInputStatus:conflict.status,failedRequestRefunded:true});
 } finally {
  stage('Revoke test session');
  report.testSessionRevoked=await oauth.revokeExtensionSession(tokens.refreshToken);
  await mkdir('artifacts/reply-assistant',{recursive:true});
  await writeFile('artifacts/reply-assistant/pilot-backend-check.json',JSON.stringify(report,null,2));
 }
},360_000);
