// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, vi } from 'vitest';
import { ReplyPanel } from './ReplyPanel';
import { ModeTabs } from './Brand';
import { writeDesignPreview } from './preview-document';
import { applyUiLocale } from './i18n';
it.skipIf(process.env.FINFOLD_REPLY_PREVIEW !== '1')('renders a static visual proof from the real reply component', async () => {
  for (const locale of ['zh','en'] as const) {
    applyUiLocale(locale);
    await writeDesignPreview(renderToStaticMarkup(createElement(ReplyPanel, {navigation:createElement(ModeTabs,{mode:'reply'})})), 'reply', locale);
  }
});
