/**
 * Inline script injected in <head> before hydration so the saved locale
 * is applied to <html lang> synchronously — prevents an en→zh-CN flash.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var p=location.pathname;var fixed=p==='/en'||p.indexOf('/en/')===0;if(fixed){document.documentElement.lang='en';return;}var l=localStorage.getItem('finfold-locale');if(l!=='zh'&&l!=='en'){var m=document.cookie.match(/(?:^|; )finfold-locale=(zh|en)(?:;|$)/);l=m&&m[1];}document.documentElement.lang=l==='en'?'en':'zh-CN';}catch(e){document.documentElement.lang=location.pathname==='/en'||location.pathname.indexOf('/en/')===0?'en':'zh-CN';}})();`;
