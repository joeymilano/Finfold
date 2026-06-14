/**
 * Inline script injected in <head> before hydration so the saved locale
 * is applied to <html lang> synchronously — prevents a zh-CN→en flash.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('finfold-locale');if(l!=='zh'&&l!=='en'){var m=document.cookie.match(/(?:^|; )finfold-locale=(zh|en)(?:;|$)/);l=m&&m[1];}document.documentElement.lang=l==='zh'?'zh-CN':'en';}catch(e){var m=document.cookie.match(/(?:^|; )finfold-locale=(zh|en)(?:;|$)/);document.documentElement.lang=m&&m[1]==='zh'?'zh-CN':'en';}})();`;
