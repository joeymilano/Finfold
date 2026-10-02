// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReplyPanel } from './ReplyPanel';
import { applyUiLocale, initializeUiLocale, uiLocale } from './i18n';
const api=vi.hoisted(()=>({getSessionInfo:vi.fn(),hasLocalSession:vi.fn(),authenticatedRequest:vi.fn(),signIn:vi.fn(),signOut:vi.fn()}));
vi.mock('./api',()=>api);
let element: HTMLDivElement,root:Root;
let local:Record<string,unknown>,session:Record<string,unknown>;
beforeEach(()=>{
 vi.clearAllMocks();applyUiLocale('zh');local={};session={};
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('chrome',{runtime:{sendMessage:vi.fn(async()=>({ok:false,code:'NOT_REPLY_PLATFORM'}))},tabs:{onActivated:{addListener:vi.fn(),removeListener:vi.fn()},onUpdated:{addListener:vi.fn(),removeListener:vi.fn()}},storage:{local:{get:async()=>local,set:async(v:object)=>Object.assign(local,v)},session:{get:async()=>session,set:async(v:object)=>Object.assign(session,v)}}});
 api.hasLocalSession.mockResolvedValue(true);
 api.getSessionInfo.mockResolvedValue({authenticated:true,userId:'pilot',brandName:'Finfold',availableCredits:30,replyDraftsEnabled:true});
 api.authenticatedRequest.mockResolvedValue({result:{status:'draft',body:'Thanks for asking.',factsToCheck:[]},availableCredits:27,cost:3});
 element=document.createElement('div');document.body.append(element);root=createRoot(element);
});
afterEach(async()=>{await act(async()=>root.unmount());element.remove();vi.unstubAllGlobals();});
async function render(){await act(async()=>root.render(createElement(ReplyPanel)));}
async function click(text:string){const button=[...element.querySelectorAll('button')].find(b=>b.textContent?.includes(text))!;await act(async()=>button.click());}
async function input(value:string){await act(async()=>{const el=element.querySelector('textarea')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
it('switches and persists the interface without changing comment or output language',async()=>{
 await render();await input('怎么买？');await click('EN');
 expect(element.textContent).toContain('Comment to reply to');expect(element.querySelector('textarea')?.value).toBe('怎么买？');
 expect(element.querySelector('select')?.value).toBe('auto');expect(local.finfoldUiLocale).toBe('en');expect(document.documentElement.lang).toBe('en');
 await act(async()=>{applyUiLocale('zh');await initializeUiLocale();});expect(uiLocale).toBe('en');
});
it('keeps a pending request and editable result across language changes without another charge',async()=>{
 let finish!:(v:unknown)=>void;api.authenticatedRequest.mockReturnValue(new Promise(r=>{finish=r;}));
 await render();await input('Thanks');
 await act(async()=>element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
 await click('生成回复');await click('EN');
 expect(element.textContent).toContain('Preparing your reply');expect(api.authenticatedRequest).toHaveBeenCalledTimes(1);
 await act(async()=>finish({result:{status:'draft',body:'Thanks for asking.',factsToCheck:[]},availableCredits:27,cost:3}));
 await click('中文');expect(element.textContent).toContain('编辑回复');expect(element.querySelector<HTMLTextAreaElement>('.reply-result textarea')?.value).toBe('Thanks for asking.');
 expect(api.authenticatedRequest).toHaveBeenCalledTimes(1);
});
it('translates existing error messages when switching languages',async()=>{
 api.hasLocalSession.mockResolvedValue(false);api.signIn.mockRejectedValue(new Error('BACKEND_NOT_DEPLOYED'));
 await render();await click('登录后生成回复');expect(element.textContent).toContain('扩展服务尚未部署');
 await click('EN');expect(element.textContent).toContain('The extension backend is not deployed yet');
});
