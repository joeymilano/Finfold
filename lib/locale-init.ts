/**
 * Keep the homepage and English route tree consistent with their rendered
 * content before hydration. Product routes still honor saved/browser locale.
 */
export const LOCALE_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(p==='/'){document.documentElement.lang='zh-CN';return;}var fixed=p==='/en'||p.indexOf('/en/')===0;if(fixed){document.documentElement.lang='en';return;}var l=localStorage.getItem('finfold-locale');if(l!=='zh'&&l!=='en'){var m=document.cookie.match(/(?:^|; )finfold-locale=(zh|en)(?:;|$)/);l=m&&m[1];}if(l!=='zh'&&l!=='en'){var n=(navigator.languages&&navigator.languages[0])||navigator.language||'';l=/^zh(?:-|$)/i.test(n)?'zh':'en';}document.documentElement.lang=l==='en'?'en':'zh-CN';}catch(e){document.documentElement.lang=location.pathname==='/en'||location.pathname.indexOf('/en/')===0?'en':'zh-CN';}})();`;
