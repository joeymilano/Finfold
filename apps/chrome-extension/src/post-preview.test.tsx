// @vitest-environment jsdom
// A clearly labelled visual fixture; no generation, account or live extraction.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { it, vi } from 'vitest';
import { App } from './App';
import { applyUiLocale } from './i18n';
import { writeDesignPreview } from './preview-document';
vi.hoisted(() => { Object.defineProperty(navigator,'language',{value:'zh-CN',configurable:true}); });
vi.mock('./api', () => ({hasLocalSession:async()=>false,getSessionInfo:vi.fn(),signIn:vi.fn(),signOut:vi.fn(),anonymousGenerate:vi.fn(),authenticatedGenerate:vi.fn(),claimAnonymousResult:vi.fn(),authenticatedRequest:vi.fn()}));
it.skipIf(process.env.FINFOLD_REPLY_PREVIEW !== '1')('renders post mode with public workbench copy for visual review', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('chrome',{runtime:{sendMessage:async()=>({ok:true,recommendedPlatform:'linkedin',page:{url:'https://www.finfold.app/workbench',title:'Finfold 创作台',siteName:'Finfold',description:'把想法变成工作流',language:'zh-CN',text:'粘贴产品介绍、发布想法、文章草稿、创始人动态或咨询观点。尽量写清楚受众、价值、证明和希望用户做什么。每个平台都会形成标题、正文、CTA、视觉建议、注意事项和平台策略。',selectionUsed:false}})},storage:{session:{get:async()=>({finfoldPanelMode:'post'}),set:async()=>{}},local:{get:async()=>({}),set:async()=>{}}}});
  const container = document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  try { await act(async()=>root.render(createElement(App))); for (const locale of ['zh','en'] as const) { await act(async()=>applyUiLocale(locale)); await writeDesignPreview(container.innerHTML, 'post', locale); } }
  finally { await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals(); }
});
