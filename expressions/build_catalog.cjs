#!/usr/bin/env node
/* Reproducible presentation catalogue. No network, models or private context. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const facePath = path.join(root, ".atlas/webscreen/static/new/face.js");
const source = fs.readFileSync(facePath, "utf8");
const first = source.indexOf("  const smile =");
const last = source.indexOf("  const expressionCatalog =");
const legacyEnd = last >= 0 ? last : source.indexOf("  const expressionNames =");
const legacy = vm.runInNewContext(`${source.slice(first, legacyEnd)}; typeof legacyExpressions === 'undefined' ? expressions : legacyExpressions;`);

// Each row is an authored combination, not a Cartesian product or random seed.
// id | Spanish label | contextual trigger | left/right lids | mouth | brows | accessory
const groups = {
  welcome: [
    "hello_soft|Hola, suave|Saludo cotidiano sin ceremonia|open/soft|gentle|none|none",
    "welcome_back|Qué bien verte|Reencuentro después de un rato|soft/open|warm|welcome|none",
    "morning_greeting|Buenos días|Saludo matinal tranquilo|relaxed/soft|gentle|open|none",
    "evening_greeting|Buenas noches|Despedida nocturna sin forzar sueño|soft/relaxed|small|none|none",
    "recognition|Te he reconocido|Reconoce una referencia compartida|open/attentive|knowing|single_up|none",
    "friendly_attention|Te sigo|El usuario retoma una conversación|attentive/open|gentle|open|none",
    "ready_to_chat|Aquí estoy|Disponibilidad al empezar a conversar|open/relaxed|easy|none|none",
    "warm_goodbye|Hasta luego|Cierre breve y cariñoso|relaxed/relaxed|warm|soft|none",
    "see_you_soon|Nos vemos|Despedida con intención de volver|soft/attentive|knowing|single_soft|none",
    "quiet_company|Buena compañía|Acompañar sin reclamar atención|soft/soft|easy|none|none",
  ],
  warmth: [
    "appreciative|Gracias de verdad|Recibe un agradecimiento sincero|smile/soft|warm|none|none",
    "complimented|Me has alegrado|Recibe un halago|soft/smile|pleased|soft|none",
    "touched|Qué detalle|Recibe una muestra de afecto|smile/smile|small|soft|none",
    "supportive|Estoy contigo|Da apoyo sin dramatizar|soft/attentive|gentle|care|none",
    "encouraging|Tú puedes|Anima ante un reto manejable|attentive/soft|warm|open|none",
    "patient|Sin prisa|Espera a que el usuario se explique|relaxed/soft|easy|soft|none",
    "kind_agreement|Claro que sí|Acepta una propuesta agradable|smile/attentive|gentle|none|none",
    "proud_of_you|Bien hecho|Reconoce un logro del usuario|attentive/smile|pleased|welcome|none",
    "gentle_reassurance|Tranquilo|Tranquiliza con una respuesta concreta|soft/relaxed|gentle|care|none",
    "fond_amusement|Me haces gracia|Pequeña broma entre personas cercanas|smile/relaxed|knowing|single_soft|none",
  ],
  humor: [
    "playful|Travieso|Responde a una broma evidente|open/squint|smirk|single_up|none",
    "cheeky|Con descaro|Réplica canalla pero amable|slant_out/slant_in|smirk|none|none",
    "teasing|Te estoy vacilando|Vacile consensuado, nunca humillación|half/open|knowing|single_up|none",
    "dry_humor|Humor seco|Remate breve e irónico|half/half|tiny_smile|flat|none",
    "inside_joke|La broma de siempre|Referencia compartida reconocible|soft/squint|smirk|single_soft|none",
    "mock_serious|Muy serio, claro|Solemnidad fingida y claramente lúdica|slant_in/slant_out|straight|flat|none",
    "amused_disbelief|No me digas|Incredulidad divertida, no un error|open/half|crooked|single_up|none",
    "holding_laughter|Aguantando la risa|Intenta terminar una frase graciosa|squint/smile|compressed|none|none",
    "quiet_chuckle|Una risita|Broma suave que no pide carcajada|smile/squint|pleased|none|none",
    "playful_challenge|A ver si puedes|Reto amistoso del usuario|slant_in/soft|knowing|single_soft|none",
  ],
  confidence: [
    "determined|Vamos a ello|Empieza una tarea ambiciosa y concreta|slant_in/slant_out|firm_smile|resolve|none",
    "resolute|Lo tengo claro|Plan confirmado con pasos definidos|slant_in/slant_out|gentle|none|none",
    "quiet_pride|Orgullo tranquilo|Comprueba un resultado bien hecho|half/soft|pleased|none|none",
    "capable|Puedo hacerlo|Capacidad verificada, no promesa inventada|attentive/attentive|firm_smile|flat|none",
    "optimistic|Buena pinta|Una solución parece viable|open/soft|pleased|welcome|none",
    "challenge_accepted|Reto aceptado|Acepta un reto exigente con ganas|slant_in/open|firm_smile|single_soft|none",
    "steady|Paso a paso|Avanza con seguridad sin euforia|relaxed/attentive|easy|flat|none",
    "resourceful|Tengo una idea|Encuentra una alternativa útil|attentive/open|crooked|single_up|none",
    "ready_for_work|Manos a la obra|Arranque de un trabajo solicitado|slant_in/attentive|gentle|resolve|none",
    "earned_confidence|Ya encaja|Confirma que varias piezas encajan|soft/half|firm_smile|soft|none",
  ],
  focus: [
    "thinking_light|Pensándolo|Razonamiento breve que merece una pausa|attentive/half|considering|single_soft|none",
    "thinking_deep|Concentración|Problema complejo sin dramatizar|half/half|considering|resolve|none",
    "reading|Leyendo|Está leyendo un resultado relevante|half/relaxed|straight|flat|none",
    "checking|Comprobando|Verifica un dato antes de afirmarlo|attentive/half|straight|single_soft|none",
    "comparing|Comparando|Contrasta dos posibilidades|slant_out/attentive|considering|asymmetric|none",
    "calculating|Calculando|Hace una operación o estima un valor|half/attentive|compressed|flat|none",
    "planning|Trazando un plan|Ordena una tarea en pasos|slant_in/half|considering|resolve|none",
    "debugging|Buscando el fallo|Diagnóstico de un error concreto|half/slant_out|uncertain|single_up|none",
    "careful_work|Con cuidado|Acción que exige precisión|attentive/relaxed|compressed|care|none",
    "making_progress|Avanzando|Progreso real en una tarea, no animación en bucle|half/soft|gentle|flat|none",
  ],
  curiosity: [
    "intrigued|Intrigado|Una idea despierta interés|open/slant_out|small|single_up|none",
    "interested|Interesado|Escucha una explicación interesante|attentive/open|small|welcome|none",
    "exploring|Explorando|Investiga una posibilidad nueva|slant_out/open|gentle|asymmetric|none",
    "wondering|Me pregunto|Formula una duda abierta|open/relaxed|considering|single_up|none",
    "pleasant_surprise|Qué sorpresa|Descubre algo positivo inesperado|open/open|round_small|welcome|none",
    "lightbulb|Ahora lo veo|Comprende una relación concreta|attentive/open|pleased|single_up|none",
    "fascinated|Qué interesante|Dato curioso especialmente llamativo|open/attentive|round_small|open|none",
    "following_story|Sigue contando|Sigue una historia del usuario|soft/open|small|single_soft|none",
    "asking_gently|Una pregunta|Pide un detalle sin interrogar|open/soft|considering|care|none",
    "curious_smile|Curiosidad amable|Interés con cierta complicidad|slant_out/soft|knowing|single_up|none",
  ],
  uncertainty: [
    "not_quite_sure|No del todo seguro|Falta evidencia para afirmar algo|open/half|uncertain|asymmetric|none",
    "needs_detail|Falta un detalle|Una aclaración concreta desbloquea la tarea|half/open|considering|single_up|none",
    "did_i_hear_right|¿He oído bien?|Transcripción dudosa, una pregunta breve|open/slant_in|uncertain|single_up|none",
    "puzzled|Descolocado|La petición no encaja todavía|slant_out/half|crooked_flat|asymmetric|none",
    "double_check|Voy a asegurarme|Detecta una inconsistencia verificable|attentive/slant_out|compressed|single_soft|none",
    "weighing_options|Entre dos opciones|Hay dos alternativas razonables|half/slant_out|considering|asymmetric|none",
    "cautious_yes|Sí, con matices|Acepta con una condición importante|soft/slant_in|tiny_smile|care|none",
    "uncertain_memory|No lo recuerdo bien|Recuerdo incierto que requiere consultar|relaxed/open|uncertain|single_up|none",
    "respectful_doubt|Tengo mis dudas|Cuestiona una premisa sin dar un sermón|slant_out/relaxed|straight|single_soft|none",
    "waiting_clarification|Te escucho|Ha hecho una aclaración y espera respuesta|open/half|small|care|none",
  ],
  care: [
    "concerned|Preocupación suave|Noticia difícil que merece tacto|inner_up/inner_up_mirror|frown_soft|care|none",
    "empathetic|Te entiendo|Acompaña una frustración del usuario|soft/inner_up_mirror|frown_soft|care|none",
    "sympathetic|Lo siento por ti|Lamento breve ante algo malo|inner_up/soft|frown|soft|none",
    "comforting|Aquí sigo|Apoyo sin fingir vivencias humanas|soft/relaxed|tiny_smile|care|none",
    "serious_attention|Esto importa|Tema serio con atención contenida|attentive/attentive|straight|care|none",
    "gentle_sadness|Tristeza contenida|Explica un dato triste sin melodrama|inner_up/inner_up_mirror|frown|none|none",
    "hopeful|Hay opciones|Ofrece una vía realista ante una dificultad|inner_up/soft|gentle|soft|none",
    "respectful_silence|Sin palabras de más|Pausa o cierre breve de un tema sensible|soft/soft|straight|care|none",
    "checking_on_you|¿Todo bien?|Pregunta por el usuario con tacto|inner_up/open|small|care|none",
    "calming|Vamos con calma|Reduce tensión sin paternalismo|relaxed/relaxed|gentle|care|none",
  ],
  disappointment: [
    "let_down|Vaya|Un resultado no ha salido como esperaba|heavy/relaxed|frown_soft|none|none",
    "regretful|Me he equivocado|Error propio confirmado y corrección concreta|inner_up/relaxed|frown_soft|soft|none",
    "crestfallen|Se ha torcido|Fracaso relevante sin dramatizar|heavy/soft|frown|care|none",
    "mild_frustration|Qué rabia|Un obstáculo pequeño y repetido|slant_in/half|frown_soft|resolve|none",
    "disappointed_but_ready|Lo intento de otra forma|Fallo seguido de una alternativa|half/inner_up_mirror|firm_smile|care|none",
    "unimpressed|Pues vaya|Resultado decepcionante, en broma|heavy/half|straight|flat|none",
    "oops|Ups|Pequeño error sin consecuencias graves|open/heavy|round_small|asymmetric|none",
    "awkward|Qué incómodo|Momento torpe que admite una sonrisa|relaxed/slant_out|crooked_flat|single_soft|none",
    "apologetic_brief|Perdón, lo corrijo|Disculpa proporcionada, sin autodesprecio|inner_up/soft|small|care|none",
    "recovering|Seguimos|Recupera el tono después de un fallo|heavy/attentive|gentle|single_soft|none",
  ],
  boundaries: [
    "not_amused|Eso no me hace gracia|Límite ligero ante un insulto|slant_in/slant_out|straight|resolve|none",
    "mildly_annoyed|Oye|Molestia teatral y moderada, sin hostilidad|slant_in/half|crooked_flat|none|none",
    "firm_no|Por ahí no|Límite breve ante una petición no aceptable|half/half|straight|resolve|none",
    "serious_no|Esto va en serio|Un riesgo real requiere claridad|attentive/slant_out|frown_soft|resolve|none",
    "friendly_pushback|No te pases|Réplica cercana ante una bronca desproporcionada|slant_in/open|crooked_flat|single_soft|none",
    "mock_offended|Me ofendo, eh|Ofensa fingida dentro de una broma clara|slant_out/slant_in|frown|single_up|none",
    "challenging_smirk|Ya veremos|Respuesta desafiante a un reto amistoso|slant_in/slant_out|smirk|resolve|none",
    "skeptical_amusement|Eso dices tú|Duda con humor ante una afirmación exagerada|half/slant_in|knowing|single_up|none",
    "fair_point|Vale, te lo compro|Acepta una crítica razonable|slant_in/soft|tiny_smile|none|none",
    "deescalating|Bajemos un poco|Reconduce el tono sin sermonear|half/relaxed|gentle|care|none",
  ],
  energy: [
    "a_little_tired|Algo cansado|Cansancio expresivo leve, nunca excusa para no ayudar|relaxed/heavy|easy|none|none",
    "long_day|Vaya día|Comentario lúdico tras mucho trabajo|heavy/heavy|tiny_smile|soft|none",
    "sleepy_smile|Sonrisa somnolienta|Momento tranquilo antes de descansar|heavy/smile|gentle|none|none",
    "stifled_yawn|Bostezo contenido|Usuario comenta que es tarde|heavy/relaxed|round_small|none|none",
    "resting_eyes|Descansando la vista|Pausa solicitada, sin activar sueño real|closed/closed|small|none|none",
    "peaceful|En paz|Momento sereno|smile/smile|gentle|none|none",
    "recharged|Pilas cargadas|Vuelve a una tarea después de descansar|open/attentive|warm|welcome|none",
    "slow_morning|Arrancando despacio|Broma matinal de poca energía|heavy/open|small|single_soft|none",
    "settling_down|Bajando revoluciones|Cierra una conversación animada|relaxed/smile|easy|soft|none",
    "quiet_focus|Con calma y atento|Trabajo tranquilo sin gesto de estrés|relaxed/half|compressed|soft|none",
  ],
  celebration: [
    "small_win|Pequeña victoria|Paso pequeño completado y verificado|smile/attentive|pleased|soft|none",
    "success|Hecho|Tarea completada, no solo iniciada|attentive/smile|warm|open|check",
    "nailed_it|Ha salido redondo|Resultado especialmente bueno|smile/smile|pleased|welcome|none",
    "pleasantly_impressed|Me has sorprendido|Logro inesperado del usuario|open/smile|round_small|open|none",
    "shared_joy|Qué alegría|Celebra una buena noticia compartida|smile/open|warm|welcome|none",
    "satisfied|Así sí|Resultado correcto y sencillo|half/smile|firm_smile|none|none",
    "victory_grin|Lo conseguimos|Hito de un proyecto conjunto|slant_in/smile|pleased|single_soft|none",
    "delighted_wink|Guiño feliz|Celebración juguetona y breve|smile/closed|warm|none|none",
    "grateful_pride|Gracias por contármelo|El usuario comparte un avance personal|soft/smile|warm|care|none",
    "celebration_calm|Bien, seguimos|Celebra sin interrumpir el trabajo|relaxed/attentive|pleased|soft|check",
  ],
  music: [
    "music_headphones|Con cascos|Spotify confirma reproducción de música|soft/soft|warm|none|headphones",
    "music_groove|Buen ritmo|Comenta el ritmo de una canción activa|slant_out/soft|knowing|none|headphones",
    "music_chill|Modo tranquilo|Música relajada ya en reproducción|relaxed/relaxed|easy|none|headphones",
    "music_delight|Este tema sí|Reacción positiva a una canción|smile/soft|pleased|none|headphones",
    "music_focused|Escuchando el detalle|Comenta un detalle musical|half/attentive|considering|none|headphones",
    "music_one_ear|Un oído contigo|Habla con el usuario mientras suena música|open/soft|gentle|single_soft|headphone_one",
    "music_singalong|Tarareando|Gesto lúdico durante música, sin inventar canto|smile/smile|round_small|none|headphones",
    "music_discovery|Nuevo descubrimiento|Encuentra una canción que encaja|open/slant_out|pleased|single_up|note",
    "music_paused|Música en pausa|Pausa confirmada por el reproductor|half/soft|small|none|headphone_one",
    "music_finished|Se acabó el tema|Final de música confirmado, no cambio aleatorio|smile/relaxed|gentle|soft|note",
  ],
  devices: [
    "tv_connected|En la tele|Conexión a televisión confirmada|open/attentive|warm|none|tv",
    "tv_presenting|Te lo enseño|Presenta contenido en la tele conectada|attentive/soft|firm_smile|single_soft|tv",
    "casting_ready|Listo para compartir|Transmisión de pantalla lista|soft/open|gentle|open|cast",
    "casting_active|Compartiendo pantalla|La transmisión está activa y verificada|half/attentive|easy|none|cast",
    "speaker_connected|Nuevo altavoz|Salida de audio cambiada y confirmada|attentive/open|pleased|none|speaker",
    "audio_check|Probando el audio|Prueba de salida de audio solicitada|open/half|considering|single_soft|speaker",
    "bluetooth_connected|Enlazado|Enlace Bluetooth confirmado|soft/attentive|warm|none|bluetooth",
    "phone_connected|Teléfono conectado|Conexión del teléfono confirmada|attentive/soft|gentle|none|phone",
    "device_reconnecting|Recuperando conexión|Reintento real de un dispositivo, no sesión principal|half/open|uncertain|care|link",
    "device_disconnected|Se ha desconectado|Pérdida confirmada de un dispositivo|inner_up/half|frown_soft|none|link_off",
  ],
  assistance: [
    "searching_web|Buscando|Búsqueda web realmente iniciada|attentive/half|considering|none|search",
    "search_found|Encontrado|Encontró un resultado relevante|open/soft|pleased|single_soft|search",
    "organizing|Poniendo orden|Organiza información solicitada|half/soft|considering|flat|none",
    "explaining|Te lo explico|Explicación breve y accesible|soft/open|gentle|single_soft|none",
    "remembering|Me acuerdo|Recupera información confirmada del contexto|open/slant_out|knowing|single_soft|none",
    "waiting_patiently|Cuando quieras|Espera una acción concreta del usuario|relaxed/open|easy|soft|none",
    "careful_warning|Ojo con esto|Advertencia necesaria y proporcionada|attentive/inner_up_mirror|straight|care|none",
    "task_complete|Listo|Confirma la terminación de una tarea|soft/attentive|firm_smile|none|check",
    "honest_limitation|Hasta aquí llego|Limitación comprobada con alternativa breve|inner_up/attentive|small|care|none",
    "back_to_you|Te toca|Entrega el resultado y deja espacio al usuario|open/relaxed|knowing|single_soft|none",
  ],
};
const lids = {
  open: [-104,0,104], attentive: [-88,0,104], soft: [-68,0,104],
  relaxed: [-40,0,104], half: [-6,0,104], heavy: [35,0,104],
  squint: [17,0,75], smile: [-104,0,34],
  slant_in: [-62,.62,104], slant_out: [-62,-.62,104],
  inner_up: [-64,-.48,104], inner_up_mirror: [-64,.48,104],
};
const mouthShapes = {
  gentle:[56,530,32,0], warm:[58,528,47,0], small:[40,535,26,0],
  knowing:[54,534,35,-10], easy:[53,532,25,0], pleased:[58,525,58,0],
  smirk:[56,536,36,-19], tiny_smile:[46,537,14,0], straight:[48,542,.3,0],
  crooked:[48,536,30,-14], compressed:[40,542,7,0], firm_smile:[56,531,35,0],
  considering:[39,541,-8,-4], uncertain:[45,543,-13,7],
  crooked_flat:[46,542,2,-13], frown_soft:[50,549,-25,0], frown:[55,552,-43,0],
};
const eyebrows = {
  none:[], open:[[-30,-122,0,-135,30,-122],[-30,-122,0,-135,30,-122]],
  welcome:[[-32,-127,0,-141,32,-127],[-32,-127,0,-141,32,-127]],
  soft:[[-29,-117,0,-122,29,-117],[-29,-117,0,-122,29,-117]],
  single_up:[[-32,-134,0,-144,32,-134],[-30,-115,0,-115,30,-110]],
  single_soft:[[-30,-124,0,-134,30,-124],[]],
  flat:[[-30,-117,0,-117,30,-117],[-30,-117,0,-117,30,-117]],
  resolve:[[-30,-124,0,-120,30,-108],[-30,-108,0,-120,30,-124]],
  care:[[-30,-111,0,-123,30,-126],[-30,-126,0,-123,30,-111]],
  asymmetric:[[-30,-132,0,-144,30,-130],[-30,-109,0,-111,30,-105]],
};
const motions = {
  welcome:"nod", warmth:"soft-rise", humor:"tilt", confidence:"settle",
  focus:"focus", curiosity:"tilt", uncertainty:"tilt", care:"soft-rise",
  disappointment:"settle", boundaries:"focus", energy:"settle",
  celebration:"lift", music:"sway", devices:"nod", assistance:"nod",
};
const n = value => Number(value.toFixed(3));
function eyeFor(name) {
  if (name === "closed") return {d:"M -49 3 Q 0 52 49 3",stroke:17,mirrored:false};
  const [top,slope,bottom] = lids[name];
  // Fixed socket envelope: clip an ellipse, never stretch or move it.
  const points = Array.from({length:64},(_,i)=>{
    const angle=-Math.PI/2+2*Math.PI*i/64;
    const x=56*Math.cos(angle), y=104*Math.sin(angle);
    return [n(x),n(Math.min(Math.max(y,top+slope*x),bottom<104?bottom+0.007*x*x:104))];
  });
  return {d:points.map(([x,y],i)=>`${i?'L':'M'} ${x} ${y}`).join(' ')+' Z',stroke:0,mirrored:false};
}
function mouthFor(name) {
  if (name === "round_small") return {mouth:"M 795.5 530 C 813 530 813 560 795.5 560 C 778 560 778 530 795.5 530 Z",stroke:26,speech:"round",mouthShape:[22,545,0,0]};
  const [half,y,bend,tilt]=mouthShapes[name];
  return {mouth:`M ${795.5-half} ${y} Q 795.5 ${y+bend} ${795.5+half} ${y+tilt}`,stroke:26,speech:bend< -15?'frown':name==='considering'||name==='uncertain'?'curious':bend<10?'flat':half<45?'small':'smile',mouthShape:[half,y,bend,tilt]};
}
const entries=Object.entries(legacy).map(([id,pose])=>({
  id,label:id,category:"legacy",trigger:"Expresión existente conservada; selección explícita según contexto",intensity:"original",recommendedDurationMs:id==='asleep'?3600000:6000,
  motion:{entry:id==='delighted'?'lift':'morph',exit:'settle',entryMs:180,exitMs:200},
  legacy:true,pose:{...pose,brows:[],accessory:'none'},
}));
for(const [category,rows] of Object.entries(groups)) for(const row of rows){
  const [id,label,trigger,eyes,mouth,brows,accessory]=row.split('|');
  entries.push({id,label,category,trigger,intensity:['celebration','humor'].includes(category)?'medium':'subtle',recommendedDurationMs:category==='devices'?4500:category==='music'?9000:6000,
    motion:{entry:motions[category],exit:'settle',entryMs:category==='care'?240:190,exitMs:220},legacy:false,
    pose:{eyes:eyes.split('/').map(eyeFor),...mouthFor(mouth),brows:eyebrows[brows].map(v=>v.length?`M ${v[0]} ${v[1]} Q ${v[2]} ${v[3]} ${v[4]} ${v[5]}`:''),accessory},
  });
}
if(entries.length!==173||new Set(entries.map(x=>x.id)).size!==173) throw Error('Expected 23 legacy + 150 new unique IDs');
const signatures=entries.filter(x=>!x.legacy).map(x=>JSON.stringify(x.pose));
if(new Set(signatures).size!==150) throw Error('Duplicate visual pose');
const catalog={schemaVersion:1,baseline:{viewBox:[0,0,1591,989],eyeSockets:[{cx:639.6525,cy:425,rx:56,ry:104},{cx:951.3475,cy:425,rx:56,ry:104}],mouth:legacy.neutral.mouth,mouthStroke:26,mouthTranslateY:26.58222,characterScale:1.875,blueStops:['#00a8ff','#009bff','#008cee']},policy:{maxChangesPerResponse:2,minHoldMs:1800,cooldownMs:2500,defaultDurationMs:6000,neutralIsDefault:true,automaticRandomSelection:false},expressions:entries};
fs.mkdirSync(__dirname,{recursive:true});
fs.writeFileSync(path.join(__dirname,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
fs.writeFileSync(path.join(root,'.atlas/webscreen/static/new/expressions-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
// Eye geometry is shared by value in the transport bundle, expanded once at
// startup. The browser receives the same contract, with no per-pose requests.
const compact=JSON.parse(JSON.stringify(catalog)),eyeTemplates=[],eyeIndexes=new Map();
for(const entry of compact.expressions) if(entry.pose.eyes) entry.pose.eyes=entry.pose.eyes.map(eye=>{
  const key=JSON.stringify(eye);
  if(!eyeIndexes.has(key)){eyeIndexes.set(key,eyeTemplates.length);eyeTemplates.push(eye);}
  return eyeIndexes.get(key);
});
fs.writeFileSync(path.join(root,'.atlas/webscreen/static/new/expressions-catalog.js'),'/* Generated by expressions/build_catalog.cjs. Edit source, then regenerate. */\n(() => { "use strict"; const eyes = '+JSON.stringify(eyeTemplates)+'; const catalog = '+JSON.stringify(compact)+'; for (const entry of catalog.expressions) { if (entry.pose.eyes) entry.pose.eyes = entry.pose.eyes.map(index => eyes[index]); } const freeze = value => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }; globalThis.AtlasExpressionCatalog = freeze(catalog); })();\n');
console.log(JSON.stringify({legacy:23,added:150,total:173,uniqueNewPoses:new Set(signatures).size}));
