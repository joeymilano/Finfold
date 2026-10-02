// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upload: vi.fn(), configured: true }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: () => mocks.configured ? { storage: { from: () => ({ upload: mocks.upload }) } } : null }));
import { persistGeneratedImageForDelivery } from '@/lib/image-persistence';
import { GET } from '@/app/api/generated-images/[userId]/[file]/route';
import { getOwnedMediaStoragePath } from '@/lib/kit-deletion';
const USER='11111111-1111-4111-8111-111111111111';
const FILE='22222222-2222-4222-8222-222222222222.png';
const PNG=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64'));
const imageResponse=()=>new Response(new Uint8Array(PNG).buffer,{headers:{'Content-Type':'image/png'}});
beforeEach(()=>{
 mocks.configured=true; mocks.upload.mockReset().mockResolvedValue({error:null});
 vi.stubEnv('NEXT_PUBLIC_APP_URL','https://www.finfold.app');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://storage.example');
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

describe('first-party generated image delivery',()=>{
 it('downloads a provider image on the server and returns only a Finfold URL after storage succeeds',async()=>{
  const fetch=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>imageResponse());vi.stubGlobal('fetch',fetch);
  const url=await persistGeneratedImageForDelivery(USER,{kind:'url',url:'https://vendor.example/image.png',revisedPrompt:null});
  expect(url).toMatch(new RegExp(`^https://www.finfold.app/api/generated-images/${USER}/[0-9a-f-]+.png$`));
  expect(String(fetch.mock.calls[0][0])).toBe('https://vendor.example/image.png');
  expect(mocks.upload).toHaveBeenCalledOnce();
  expect(mocks.upload.mock.calls[0][0]).toMatch(new RegExp(`^${USER}/covers/`));
  expect(getOwnedMediaStoragePath(url,USER)).toBe(mocks.upload.mock.calls[0][0]);
  expect(getOwnedMediaStoragePath(url,'another-user')).toBeNull();
 });
 it('does not hand an overseas hotlink to the browser when persistence fails',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>imageResponse()));
  mocks.upload.mockResolvedValue({error:{message:'storage unavailable'}});
  await expect(persistGeneratedImageForDelivery(USER,{kind:'url',url:'https://vendor.example/image.png',revisedPrompt:null})).rejects.toThrow('could not be stored');
 });
 it('rejects invalid bytes before storing and supports valid byte providers without a network fetch',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(persistGeneratedImageForDelivery(USER,{kind:'bytes',bytes:new TextEncoder().encode('<svg onload="attack"/>'),contentType:'image/png',revisedPrompt:null})).rejects.toThrow('validation');
  expect(mocks.upload).not.toHaveBeenCalled();
  await expect(persistGeneratedImageForDelivery(USER,{kind:'bytes',bytes:PNG,contentType:'image/png',revisedPrompt:null})).resolves.toContain('/api/generated-images/');
  expect(fetch).not.toHaveBeenCalled();
 });
 it('serves a public generated cover without redirecting the browser or forwarding credentials',async()=>{
  const fetch=vi.fn(async(_input: RequestInfo | URL, _init?: RequestInit)=>imageResponse());vi.stubGlobal('fetch',fetch);
  const response=await GET(new Request('https://www.finfold.app/api/generated-images/test',{headers:{Authorization:'Bearer browser-token'}}),{params:Promise.resolve({userId:USER,file:FILE})});
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toBe('image/png');
  expect(response.headers.get('Location')).toBeNull();
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  const [url,init]=fetch.mock.calls[0] as unknown as [URL,RequestInit];
  expect(String(url)).toBe(`https://storage.example/storage/v1/object/public/media/${USER}/covers/${FILE}`);
  expect(new Headers(init.headers).has('Authorization')).toBe(false);
 });
 it.each([{userId:'../private',file:FILE},{userId:USER,file:'../../../attachments/private.pdf'},{userId:USER,file:FILE+'.svg'}])('cannot proxy private paths or arbitrary URLs: %j',async params=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  expect((await GET(new Request('https://www.finfold.app/api/generated-images/test?url=https://evil.example'),{params:Promise.resolve(params)})).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
 });
 it('never serves an upstream HTML error as an image',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response('<html>private upstream diagnostic</html>')));
  const response=await GET(new Request('https://www.finfold.app/api/generated-images/test'),{params:Promise.resolve({userId:USER,file:FILE})});
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('private upstream diagnostic');
 });
});
