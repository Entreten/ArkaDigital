
(()=>{
 'use strict';
 const get=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}},set=(key,value)=>{try{localStorage.setItem(key,String(value));}catch{}};
 const tracks={original:{src:'/audio/arka-original.mp3',title:'Juntos somos más',subtitle:'ARKA DIGITAL · Canción original'},christmas:{src:'/audio/arka-navidad.mp3',title:'Navidad en ARKA',subtitle:'Canción navideña original'},love:{src:'/audio/arka-amor.mp3',title:'Comparte el corazón',subtitle:'Amor y amistad · ARKA'}};
 const root=document.createElement('div');root.id='music-root';document.body.append(root);
 const audio=new Audio();audio.loop=true;audio.preload='none';audio.volume=Math.min(.6,Math.max(0,Number(get('arka_music_volume','.16'))||0));
 let current='',playing=false,enabled=get('arka_music_enabled','pending'),minimized=get('arka_music_minimized','false')==='true',busy=false,hiddenPause=false;
 function draw(){const t=tracks[current]||tracks.original;if(minimized){root.innerHTML='<button type="button" class="music-mini" data-music-action="expand" aria-label="Abrir controles de música">♫</button>';return;}root.innerHTML='<section class="music-player" role="region" aria-label="Música de ARKA DIGITAL"><button type="button" data-music-action="toggle" aria-label="'+(playing?'Pausar música':'Activar música')+'" title="'+(playing?'Pausar música':'Activar música')+'">'+(playing?'Ⅱ':'▶')+'</button><div class="music-copy"><strong>'+t.title+'</strong><small>'+(busy?'Cargando música…':playing?t.subtitle:'Pulsa ▶ para escuchar')+'</small></div><input type="range" min="0" max="0.6" step="0.01" value="'+audio.volume+'" data-music-volume aria-label="Volumen de la música"><button type="button" data-music-action="close" aria-label="Minimizar reproductor">×</button></section>';}
 async function play(){if(!audio.src)return;busy=true;draw();try{await audio.play();playing=true;enabled='true';set('arka_music_enabled','true');}catch{playing=false;}finally{busy=false;draw();}}
 function pause(persist=true){audio.pause();playing=false;if(persist){enabled='false';set('arka_music_enabled','false');}draw();}
 function select(name){name=tracks[name]?name:'original';if(name===current)return;const resume=playing;audio.pause();playing=false;current=name;audio.src=tracks[name].src;audio.load();draw();if(resume)play();}
 window.addEventListener('arka:theme',event=>select(event.detail.name));
 root.addEventListener('click',async event=>{const button=event.target.closest('[data-music-action]');if(!button)return;event.stopPropagation();if(button.dataset.musicAction==='toggle'){if(playing)pause();else await play();}else if(button.dataset.musicAction==='close'){minimized=true;set('arka_music_minimized',true);draw();}else{minimized=false;set('arka_music_minimized',false);draw();}});
 root.addEventListener('input',event=>{if(event.target.matches('[data-music-volume]')){audio.volume=Number(event.target.value);set('arka_music_volume',audio.volume);}});
 let firstGesture=false;function activate(event){if(firstGesture||root.contains(event.target))return;firstGesture=true;if(enabled!=='false')play();}document.addEventListener('pointerdown',activate,{passive:true});document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key))activate(event);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenPause=playing;if(playing)pause(false);}else if(hiddenPause){hiddenPause=false;if(enabled==='true')play();}});
 audio.addEventListener('error',()=>{playing=false;busy=false;draw();});audio.addEventListener('pause',()=>{playing=false;});
 select((document.body.className.match(/theme-(original|christmas|love)/)||[])[1]||'original');
})();
