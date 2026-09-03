'use strict';
// Cache only the appearance for first paint. Native preferences remain authoritative.
window.applyAtlasTheme=function(value){
  const theme=value==='light'?'light':'dark';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('atlas.theme',theme);}catch{}
  return theme;
};
try{applyAtlasTheme(localStorage.getItem('atlas.theme'));}catch{applyAtlasTheme('dark');}
