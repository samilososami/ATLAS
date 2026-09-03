'use strict';
// Cache only the appearance for first paint. Native preferences remain authoritative.
window.applyAtlasTheme=function(){document.documentElement.dataset.theme='light';return 'light';};
applyAtlasTheme();
