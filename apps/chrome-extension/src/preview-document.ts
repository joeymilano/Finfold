// Local visual evidence only. Never imported by the extension entry points.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function writeDesignPreview(component: string, mode: 'post' | 'reply', locale: 'zh' | 'en' = 'zh') {
  const tokens = await readFile(resolve('src/app-tokens.css'), 'utf8');
  const font = await readFile(resolve('src/assets/geist-sans.woff2'));
  const css = (await readFile(resolve('src/styles.css'), 'utf8'))
    .replace('@import "./app-tokens.css";', tokens)
    .replace('./assets/geist-sans.woff2', `data:font/woff2;base64,${font.toString('base64')}`);
  for (const theme of ['light','dark']) {
    const icon = await readFile(resolve(`src/assets/app-icon-${theme}.webp`));
    component = component.replace(new RegExp(`(?:/src)?/assets/app-icon-${theme}\\.webp(?:\\?inline)?`, 'g'), `data:image/webp;base64,${icon.toString('base64')}`);
  }
  const output = resolve('../../artifacts/reply-assistant'); await mkdir(output,{recursive:true});
  for (const theme of ['light','dark']) {
    const languageSuffix = locale === 'en' ? '-en' : '';
    const suffix = (theme === 'dark' ? '-dark' : '') + languageSuffix;
    const name = mode === 'reply' ? 'preview' : 'preview-post';
    // Static review links replace only navigation, never fake account/model actions.
    let page = component.replace(/(<nav class="mode-switch"[\s\S]*?<\/nav>)/, nav => {
      let index=0;
      return nav.replace(/<button([^>]*)>([\s\S]*?)<\/button>/g, (_match, attributes, body) => `<a ${attributes} href="${index++ === 0 ? 'preview-post' : 'preview'}${suffix}.html">${body}</a>`);
    });
    page = page.replace(/<button[^>]*class="theme-button"[^>]*>[\s\S]*?<\/button>/, `<a class="theme-button" aria-label="${locale === 'zh' ? '切换主题' : 'Switch theme'}" href="${name}${theme === 'light' ? '-dark' : ''}${languageSuffix}.html">◐</a>`);
    page = page.replace(/<button[^>]*class="language-button"[^>]*>[\s\S]*?<\/button>/, `<a class="language-button" href="${name}${theme === 'dark' ? '-dark' : ''}${locale === 'zh' ? '-en' : ''}.html">${locale === 'zh' ? 'EN' : '中文'}</a>`);
    const label = locale === 'en' ? 'Design preview · Account not connected' : mode === 'post' ? '界面预览 · 素材取自 Finfold 公开工作台' : '界面预览 · 未连接账号';
    const html = `<!doctype html><html lang="${locale === 'zh' ? 'zh-CN' : 'en'}" data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finfold · ${locale === 'en' ? (mode === 'post' ? 'Create post' : 'Reply to comment') : (mode === 'post' ? '生成帖子' : '回复评论')} · ${locale === 'en' ? (theme === 'light' ? 'Light preview' : 'Dark preview') : (theme === 'light' ? '浅色预览' : '深色预览')}</title><style>${css}\nbody{max-width:420px;margin:auto}.proof-label{padding:8px 20px;font-size:10px;color:rgb(var(--fg-muted));border-bottom:1px solid rgb(var(--hairline));display:flex;justify-content:space-between;gap:12px}.proof-label a{color:rgb(var(--action))}body>.shell{max-width:420px}.mode-switch a{display:flex;align-items:center;justify-content:center;gap:7px;flex:1;min-height:36px;padding:6px;border:1px solid transparent;border-radius:7px;color:rgb(var(--fg-muted));font-size:12px;text-decoration:none}.mode-switch a[aria-pressed="true"]{background:rgb(var(--surface));border-color:rgb(var(--hairline)/.65);color:rgb(var(--fg))}.theme-button,.language-button{text-decoration:none;display:flex;align-items:center;justify-content:center}</style><div class="proof-label"><span>${label}</span><a href="${name}${theme === 'light' ? '-dark' : ''}${languageSuffix}.html">${locale === 'en' ? (theme === 'light' ? 'Dark theme' : 'Light theme') : (theme === 'light' ? '查看深色' : '查看浅色')}</a></div>${page}</html>`;
    await writeFile(resolve(output, `${name}${suffix}.html`),html);
  }
}
