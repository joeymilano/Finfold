/**
 * Inline script injected in <head> before hydration so the saved locale
 * is applied to <html lang> synchronously — prevents a zh-CN→en flash.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=localStorage.getItem('finfold-locale');document.documentElement.lang=l==='zh'?'zh-CN':'en';}catch(e){document.documentElement.lang='en';}})();`;
