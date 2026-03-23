(function(){
'use strict';

/* ========== CONFIG ========== */
var SUPABASE_URL='https://jhopwqpbaiyjfoggvcaf.supabase.co';
var SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impob3B3cXBiYWl5amZvZ2d2Y2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI2OTEsImV4cCI6MjA4ODYyODY5MX0.rz3TJZryPxEf3P5kQgpzQkwN9aF8_F4eo4F03CEYVPs';
var TABLE='prepamedecine_articles';
var TABLE_PREPAS='prepamedecine_prepas';
var TABLE_PAGES='page_content';
var ADMIN_EMAILS=['aaron@diploma-sante.fr'];
var MAX_LOGIN_ATTEMPTS=5;
var LOCKOUT_DURATION_MS=15*60*1000;
var INACTIVITY_TIMEOUT_MS=30*60*1000;

/* Tag colors */
var TAG_COLORS={Guide:'#046bd2',PASS:'#059669',LAS:'#7c3aed',Prépas:'#ec4899',Villes:'#f59e0b',Actualités:'#ef4444'};
var TAG_OPTIONS=['Guide','PASS','LAS','Prépas','Villes','Actualités'];

/* Block types */
var BLOCK_TYPES=[
  {type:'heading',label:'Titre',badge:'H2'},
  {type:'paragraph',label:'Paragraphe',badge:'P'},
  {type:'callout',label:'Callout',badge:'!'},
  {type:'list',label:'Liste',badge:'•'},
  {type:'table',label:'Tableau',badge:'⊞'},
  {type:'image',label:'Image',badge:'🖼'},
  {type:'grid',label:'Grille',badge:'⊟'},
  {type:'stats-grid',label:'Stats',badge:'#'},
  {type:'faq',label:'FAQ',badge:'?'},
  {type:'link-card',label:'Lien',badge:'→'}
];

/* ========== STATE ========== */
var sb,loginAttempts=0,lockoutUntil=0,inactivityTimer=null;
var state={view:'dashboard',currentId:null,articleData:null,prepaData:null,unsaved:false};
var articlesCache=[],prepasCache=[],pagesCache=[],competitorCache=null;

/* ========== INIT ========== */
function init(){
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  loadLockoutState();checkSession();
}

async function checkSession(){
  var r=await sb.auth.getSession();
  if(r.data.session){
    var email=r.data.session.user.email;
    if(!isAdminEmail(email)){await sb.auth.signOut();showLogin('Acces non autorise.');return}
    document.getElementById('admin-user-email').textContent=email;
    startInactivityTimer();showDashboard();
  }else{showLogin()}
}

function isAdminEmail(email){return ADMIN_EMAILS.indexOf(email.toLowerCase())!==-1}

/* ========== AUTH ========== */
function loadLockoutState(){try{var s=localStorage.getItem('admin_lockout');if(s){var d=JSON.parse(s);loginAttempts=d.attempts||0;lockoutUntil=d.until||0;if(Date.now()>lockoutUntil){loginAttempts=0;lockoutUntil=0;localStorage.removeItem('admin_lockout')}}}catch(e){}}
function saveLockoutState(){try{localStorage.setItem('admin_lockout',JSON.stringify({attempts:loginAttempts,until:lockoutUntil}))}catch(e){}}
function clearLockoutState(){loginAttempts=0;lockoutUntil=0;try{localStorage.removeItem('admin_lockout')}catch(e){}}

function startInactivityTimer(){clearInactivityTimer();var events=['mousedown','keydown','scroll','touchstart'];function reset(){clearTimeout(inactivityTimer);inactivityTimer=setTimeout(autoLogout,INACTIVITY_TIMEOUT_MS)}events.forEach(function(ev){document.addEventListener(ev,reset,{passive:true})});reset()}
function clearInactivityTimer(){if(inactivityTimer){clearTimeout(inactivityTimer);inactivityTimer=null}}
async function autoLogout(){clearInactivityTimer();await sb.auth.signOut();alert('Session expiree.');location.reload()}

function showLogin(msg){
  document.getElementById('admin-login').style.display='flex';
  document.getElementById('admin-dashboard').style.display='none';
  var err=document.getElementById('login-error');
  if(msg){err.textContent=msg;err.style.display='block'}
  document.getElementById('login-form').onsubmit=async function(e){
    e.preventDefault();
    var email=document.getElementById('login-email').value.trim().toLowerCase();
    var pass=document.getElementById('login-password').value;
    var btn=this.querySelector('.btn-login');
    err.style.display='none';
    if(lockoutUntil>Date.now()){err.textContent='Trop de tentatives. Reessayez dans '+Math.ceil((lockoutUntil-Date.now())/60000)+' min.';err.style.display='block';return}
    if(!isAdminEmail(email)){loginAttempts++;if(loginAttempts>=MAX_LOGIN_ATTEMPTS){lockoutUntil=Date.now()+LOCKOUT_DURATION_MS}saveLockoutState();err.textContent='Acces refuse.';err.style.display='block';return}
    btn.disabled=true;
    var result=await sb.auth.signInWithPassword({email:email,password:pass});
    if(result.error){loginAttempts++;if(loginAttempts>=MAX_LOGIN_ATTEMPTS){lockoutUntil=Date.now()+LOCKOUT_DURATION_MS;saveLockoutState();err.textContent='Compte bloque 15 minutes.'}else{saveLockoutState();err.textContent='Identifiants incorrects. '+(MAX_LOGIN_ATTEMPTS-loginAttempts)+' tentative(s) restante(s).'}err.style.display='block';btn.disabled=false;return}
    clearLockoutState();document.getElementById('admin-user-email').textContent=email;startInactivityTimer();showDashboard();
  };
}

window.adminLogout=async function(){clearInactivityTimer();await sb.auth.signOut();location.reload()};

/* ========== DATA LOADING ========== */
async function showDashboard(){
  document.getElementById('admin-login').style.display='none';
  document.getElementById('admin-dashboard').style.display='flex';
  await Promise.all([loadArticles(),loadPrepas(),loadPages()]);
  renderSidebar();navigate('dashboard');
}

async function loadArticles(){var r=await sb.from(TABLE).select('*').order('updated_at',{ascending:false});articlesCache=r.data||[]}
async function loadPrepas(){var r=await sb.from(TABLE_PREPAS).select('*').order('name',{ascending:true});prepasCache=r.data||[]}
async function loadPages(){var r=await sb.from(TABLE_PAGES).select('id,page_slug,title,page_type,published,updated_at').order('page_slug',{ascending:true});pagesCache=r.data||[]}

/* ========== SIDEBAR ========== */
function renderSidebar(){
  var v=state.view;
  var isArt=v==='articles'||v==='editor';
  var isPrep=v==='prepas'||v==='prepa-editor';
  var isPag=v==='pages'||v==='page-editor';
  var html='';
  html+=navItem('dashboard','&#9776;','Tableau de bord',null,v==='dashboard');
  html+=navItem('prepas','&#127979;','Prepas',prepasCache.length,isPrep);
  html+=navItem('articles','&#128196;','Articles',articlesCache.length,isArt);
  html+=navItem('pages','&#128462;','Pages',pagesCache.length,isPag);
  document.getElementById('admin-sidebar').innerHTML=html;
}

function navItem(view,icon,label,count,active){
  var h='<button class="admin-nav-item'+(active?' active':'')+'" onclick="navigate(\''+view+'\')"><span class="nav-icon">'+icon+'</span>'+label;
  if(count!==null)h+='<span class="nav-count">'+count+'</span>';
  return h+'</button>';
}

/* ========== NAVIGATION ========== */
window.navigate=function(viewId){
  if(state.unsaved&&!confirm('Modifications non sauvegardees. Continuer ?'))return;
  state.unsaved=false;state.view=viewId;state.currentId=null;
  if(viewId==='dashboard')renderDashboardHome();
  else if(viewId==='articles')renderArticleList();
  else if(viewId==='prepas')renderPrepaList();
  else if(viewId==='pages')renderPageList();
  renderSidebar();
};

window.editArticle=function(id){
  if(state.unsaved&&!confirm('Modifications non sauvegardees. Continuer ?'))return;
  state.unsaved=false;state.currentId=id;state.view='editor';
  loadArticleData(id);renderSidebar();
};
window.editPrepa=function(id){
  if(state.unsaved&&!confirm('Modifications non sauvegardees. Continuer ?'))return;
  state.unsaved=false;state.currentId=id;state.view='prepa-editor';
  loadPrepaData(id);renderSidebar();
};
window.editPage=function(slug){
  if(state.unsaved&&!confirm('Modifications non sauvegardees. Continuer ?'))return;
  state.unsaved=false;state.currentId=slug;state.view='page-editor';
  loadPageData(slug);renderSidebar();
};

/* ========== HELPERS ========== */
function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
function escAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function formatDate(iso){if(!iso)return'--';var d=new Date(iso);return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}
function showToast(msg,type){var t=document.getElementById('admin-toast');t.textContent=msg;t.className='admin-toast'+(type?' '+type:'');setTimeout(function(){t.classList.add('show')},10);setTimeout(function(){t.classList.remove('show')},3000)}
function slugify(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')}
function getVal(n){var el=document.querySelector('[name="'+n+'"]');return el?el.value.trim():''}
window.markUnsaved=function(){state.unsaved=true};
function scoreBadge(val){var cls=val<50?'score-low':val<=75?'score-mid':'score-good';return'<span class="score-badge '+cls+'">'+val+'</span>'}
function statusLabel(s){if(s==='published')return'<span class="status-dot published"></span>Publie';if(s==='archived')return'<span class="status-dot archived"></span>Archive';return'<span class="status-dot draft"></span>Brouillon'}
function tagBadge(tag){var c=TAG_COLORS[tag]||'#6b7280';return'<span class="tag-badge" style="background:'+c+'">'+esc(tag||'--')+'</span>'}

function metaBoxOpen(title,collapsed){
  return'<div class="admin-meta-box'+(collapsed?' collapsed':'')+'">'+
    '<div class="admin-meta-box-header'+(collapsed?' collapsed':'')+'" onclick="this.classList.toggle(\'collapsed\');this.parentElement.classList.toggle(\'collapsed\')">'+
    title+'<span class="toggle-icon">&#9660;</span></div><div class="admin-meta-box-body">';
}
function metaBoxClose(){return'</div></div>'}

function field(name,label,value,type,hint){
  var h='<div class="admin-field">';
  if(label)h+='<label>'+label+'</label>';
  if(type==='textarea')h+='<textarea name="'+name+'" oninput="markUnsaved()">'+esc(value)+'</textarea>';
  else if(type==='select')h+='<select name="'+name+'" onchange="markUnsaved()">'+value+'</select>';
  else h+='<input type="'+(type||'text')+'" name="'+name+'" value="'+escAttr(value)+'" oninput="markUnsaved()">';
  if(hint)h+='<div class="admin-field-hint">'+hint+'</div>';
  h+='</div>';return h;
}

function showAIOverlay(msg){if(document.getElementById('ai-overlay'))return;document.body.insertAdjacentHTML('beforeend','<div id="ai-overlay" class="ai-overlay"><div class="ai-overlay-content"><div class="ai-spinner"></div><p>'+msg+'</p></div></div>')}
function hideAIOverlay(){var el=document.getElementById('ai-overlay');if(el)el.remove()}

/* ========== SEO ANALYSIS (15 checks) ========== */
function stripHtml(html){return(html||'').replace(/<[^>]*>/g,'').trim()}
function normalize(text){return(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
function countWords(text){var t=stripHtml(text);return t.split(/\s+/).filter(function(w){return w.length>0}).length}

function extractTextFromBlocks(sections){
  return(sections||[]).map(function(s){
    switch(s.type){
      case 'heading':return s.text||'';
      case 'paragraph':case 'callout':return stripHtml(s.html||'');
      case 'list':return(s.items||[]).map(stripHtml).join(' ');
      case 'table':return[].concat(s.headers||[]).concat((s.rows||[]).reduce(function(a,r){return a.concat(r)},[]) ).join(' ');
      case 'faq':return(s.items||[]).map(function(i){return(i.question||'')+' '+(i.answer||'')}).join(' ');
      case 'grid':case 'stats-grid':return(s.items||[]).map(function(i){return(i.title||i.value||'')+' '+(i.description||i.label||'')}).join(' ');
      case 'link-card':return(s.title||'')+' '+(s.description||'');
      default:return'';
    }
  }).join(' ');
}

function extractLinks(sections){
  var internal=0,external=0;
  function classify(href){if(!href)return;if(href.startsWith('/')||href.indexOf('prepamedecine')>=0)internal++;else if(href.startsWith('http'))external++}
  function fromHtml(html){var m=(html||'').match(/<a[^>]*href="([^"]*)"/g)||[];m.forEach(function(l){var h=(l.match(/href="([^"]*)"/) ||[])[1];classify(h)})}
  (sections||[]).forEach(function(s){
    if(s.type==='paragraph'||s.type==='callout')fromHtml(s.html);
    else if(s.type==='list')(s.items||[]).forEach(fromHtml);
    else if(s.type==='faq')(s.items||[]).forEach(function(i){fromHtml(i.answer)});
    else if(s.type==='link-card')classify(s.href);
    else if(s.type==='table')(s.rows||[]).forEach(function(r){r.forEach(fromHtml)});
    else if(s.type==='grid')(s.items||[]).forEach(function(i){fromHtml(i.description)});
  });
  return{internal:internal,external:external};
}

function analyzeSEO(params){
  var title=params.title||'',metaTitle=params.metaTitle||'',metaDesc=params.metaDescription||'',slug=params.slug||'',kw=normalize(params.focusKeyword||''),sections=params.sections||[];
  var fullText=normalize(extractTextFromBlocks(sections)),wordCount=countWords(fullText),links=extractLinks(sections);
  var headings=(sections||[]).filter(function(s){return s.type==='heading'}),h2s=headings.filter(function(h){return h.level==='h2'}),h3s=headings.filter(function(h){return h.level==='h3'});
  var firstPara=sections.find(function(s){return s.type==='paragraph'}),firstText=firstPara?normalize(stripHtml(firstPara.html||'')):'';
  var first150=firstText.split(/\s+/).slice(0,150).join(' ');
  var kwOcc=kw?(fullText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'))||[]).length:0;
  var density=wordCount>0?(kwOcc/wordCount)*100:0;
  var images=sections.filter(function(s){return s.type==='image'});
  var imgsWithAlt=images.filter(function(i){return(i.alt||'').trim().length>0});
  var imgsWithKw=kw?images.filter(function(i){return normalize(i.alt||'').indexOf(kw)>=0}):[];
  var checks=[];

  // Basic (6)
  checks.push({id:'kw-title',cat:'basic',passed:kw?normalize(metaTitle).indexOf(kw)>=0:false,label:'Mot-cle dans le titre SEO',msg:kw?(normalize(metaTitle).indexOf(kw)>=0?'OK':'Ajoutez "'+params.focusKeyword+'" dans le titre'):'Definissez un mot-cle'});
  checks.push({id:'kw-start',cat:'basic',passed:kw?normalize(metaTitle).indexOf(kw)<20:false,label:'Mot-cle au debut du titre',msg:kw?(normalize(metaTitle).indexOf(kw)<20?'OK':'Placez le mot-cle plus tot'):'Definissez un mot-cle'});
  checks.push({id:'kw-meta',cat:'basic',passed:kw?normalize(metaDesc).indexOf(kw)>=0:false,label:'Mot-cle dans la meta',msg:kw?(normalize(metaDesc).indexOf(kw)>=0?'OK':'Ajoutez dans la meta'):'Definissez un mot-cle'});
  var slugN=normalize(slug.replace(/-/g,' '));var kwInSlug=kw?kw.split(/\s+/).filter(function(w){return w.length>2}).every(function(w){return slugN.indexOf(w)>=0}):false;
  checks.push({id:'kw-slug',cat:'basic',passed:kwInSlug,label:'Mot-cle dans l\'URL',msg:kwInSlug?'OK':'Ajoutez dans le slug'});
  var tLen=(metaTitle||title).length;
  checks.push({id:'title-len',cat:'basic',passed:tLen>=30&&tLen<=60,label:'Longueur titre ('+tLen+'/60)',msg:tLen<30?'Trop court':tLen>60?'Trop long':'OK'});
  var mLen=metaDesc.length;
  checks.push({id:'meta-len',cat:'basic',passed:mLen>=120&&mLen<=160,label:'Longueur meta ('+mLen+'/160)',msg:mLen<120?'Trop courte':mLen>160?'Trop longue':'OK'});

  // Content (5)
  checks.push({id:'kw-intro',cat:'content',passed:kw?first150.indexOf(kw)>=0:false,label:'Mot-cle dans l\'intro',msg:kw?(first150.indexOf(kw)>=0?'OK':'Ajoutez dans les 150 premiers mots'):'Definissez un mot-cle'});
  var kwH2=kw?h2s.some(function(h){return normalize(h.text||'').indexOf(kw)>=0}):false;
  checks.push({id:'kw-h2',cat:'content',passed:kwH2,label:'Mot-cle dans un H2',msg:kwH2?'OK':'Ajoutez dans un H2'});
  checks.push({id:'kw-density',cat:'content',passed:kw?density>=0.5&&density<=2.5:false,label:'Densite mot-cle ('+density.toFixed(1)+'%)',msg:density<0.5?'Trop faible':density>2.5?'Trop elevee':'OK'});
  checks.push({id:'content-len',cat:'content',passed:wordCount>=600,label:'Contenu ('+wordCount+'/600 mots)',msg:wordCount>=600?'OK':'Contenu trop court'});
  checks.push({id:'headings',cat:'content',passed:h2s.length+h3s.length>=2,label:h2s.length+' H2, '+h3s.length+' H3',msg:h2s.length+h3s.length>=2?'OK':'Min. 2 sous-titres'});

  // Links (4)
  checks.push({id:'int-links',cat:'links',passed:links.internal>=2,label:links.internal+' liens internes',msg:links.internal>=2?'OK':'Min. 2 liens internes'});
  checks.push({id:'ext-links',cat:'links',passed:links.external>=1,label:links.external+' lien(s) externe(s)',msg:links.external>=1?'OK':'Min. 1 lien externe'});
  checks.push({id:'img-kw',cat:'links',passed:images.length===0||imgsWithKw.length>0,label:'Image alt + mot-cle',msg:images.length===0?'Pas d\'image':imgsWithKw.length>0?'OK':'Ajoutez le mot-cle dans un alt'});
  checks.push({id:'img-alt',cat:'links',passed:images.length===0||imgsWithAlt.length===images.length,label:'Alt sur toutes images',msg:images.length===0?'Pas d\'image':imgsWithAlt.length===images.length?'OK':(images.length-imgsWithAlt.length)+' sans alt'});

  var passed=checks.filter(function(c){return c.passed}).length;
  return{score:Math.round((passed/checks.length)*100),checks:checks};
}

/* ========== GEO ANALYSIS (10 checks) ========== */
function analyzeGEO(params){
  var sections=params.sections||[];
  var fullText=extractTextFromBlocks(sections),wordCount=countWords(fullText);
  var checks=[];

  var faqSections=sections.filter(function(s){return s.type==='faq'});
  var faqItems=faqSections.reduce(function(a,s){return a.concat(s.items||[])},[]);
  checks.push({id:'faq',passed:faqItems.length>=3,label:'FAQ ('+faqItems.length+'/3 min)',msg:faqItems.length>=3?'OK':'Min. 3 questions'});

  var detailedFaq=faqItems.filter(function(i){return(i.answer||'').length>80});
  checks.push({id:'faq-detail',passed:faqItems.length===0||detailedFaq.length>=faqItems.length*0.7,label:'FAQ detaillees',msg:detailedFaq.length+'/'+faqItems.length+' >80 car.'});

  var lists=sections.filter(function(s){return s.type==='list'});
  checks.push({id:'lists',passed:lists.length>=1,label:'Listes structurees ('+lists.length+')',msg:lists.length>=1?'OK':'Ajoutez une liste'});

  var structured=sections.filter(function(s){return s.type==='table'||s.type==='grid'||s.type==='stats-grid'});
  checks.push({id:'structured',passed:structured.length>=1,label:'Donnees structurees ('+structured.length+')',msg:structured.length>=1?'OK':'Ajoutez tableau/grille'});

  var numbers=(fullText.match(/\d+[\s,.]\d+|\d+\s*[%€$£]|\d+\s*(ans?|mois|euros?|places?)/gi)||[]);
  checks.push({id:'stats',passed:numbers.length>=3,label:'Chiffres ('+numbers.length+')',msg:numbers.length>=3?'OK':'Ajoutez des statistiques'});

  checks.push({id:'geo-len',passed:wordCount>=800,label:'Contenu ('+wordCount+'/800 mots)',msg:wordCount>=800?'OK':'Min. 800 mots pour IA'});

  var h2s=sections.filter(function(s){return s.type==='heading'&&s.level==='h2'});
  var qH2=h2s.filter(function(h){return(h.text||'').indexOf('?')>=0||/^(comment|pourquoi|quand|combien|quel|quelle|quels|quelles|où|est-ce|faut-il)/i.test(h.text||'')});
  checks.push({id:'q-h2',passed:qH2.length>=2,label:'H2 questions ('+qH2.length+')',msg:qH2.length>=2?'OK':'Reformulez des H2 en questions'});

  var links=extractLinks(sections);
  checks.push({id:'geo-ext',passed:links.external>=2,label:'Sources externes ('+links.external+')',msg:links.external>=2?'OK':'Min. 2 sources'});

  var callouts=sections.filter(function(s){return s.type==='callout'});
  checks.push({id:'callouts',passed:callouts.length>=1,label:'Callouts ('+callouts.length+')',msg:callouts.length>=1?'OK':'Ajoutez un encadre'});

  var defPat=/(?:c'est|c'est|désigne|signifie|consiste à|se définit|on appelle)/i;
  checks.push({id:'defs',passed:defPat.test(fullText),label:'Definitions directes',msg:defPat.test(fullText)?'OK':'Ajoutez des definitions'});

  var passed=checks.filter(function(c){return c.passed}).length;
  return{score:Math.round((passed/checks.length)*100),checks:checks};
}

/* ========== DASHBOARD ========== */
function renderDashboardHome(){
  var main=document.getElementById('admin-main');
  var total=articlesCache.length;
  var pub=articlesCache.filter(function(a){return a.status==='published'}).length;
  var drafts=articlesCache.filter(function(a){return a.status!=='published'}).length;
  var totalP=prepasCache.length;
  var coeur=prepasCache.filter(function(p){return p.coup_de_coeur}).length;

  var html='<div class="admin-dashboard-home">';
  html+='<div class="admin-welcome"><h2>Bienvenue sur le backoffice PrepaMedecine</h2>';
  html+='<p>Gerez les prepas, articles et pages depuis cette interface.</p></div>';
  html+='<div class="admin-stats-grid">';
  html+=statCard(pub,'Articles publies','articles');
  html+=statCard(drafts,'Brouillons','articles');
  html+=statCard(total,'Total articles','articles');
  html+=statCard(totalP,'Prepas','prepas');
  html+=statCard(coeur,'Coup de coeur',null);
  html+=statCard(pagesCache.length,'Pages','pages');
  html+='</div>';

  // Quick actions
  html+='<div style="display:flex;gap:8px;margin-bottom:20px">';
  html+='<button class="btn-primary" onclick="showAddModal()">+ Nouvel article</button>';
  html+='<button class="btn-secondary" onclick="window.open(\'/\',\'_blank\')">&#128065; Voir le site</button>';
  html+='</div>';

  var recent=articlesCache.slice(0,8);
  if(recent.length){
    html+='<div class="admin-recent"><div class="admin-recent-header">Articles recemment modifies</div>';
    recent.forEach(function(a){
      html+='<div class="admin-recent-item" onclick="editArticle('+a.id+')">';
      html+='<span class="ri-title">'+esc(a.title||'Sans titre')+'</span>';
      html+='<span class="ri-cat">'+tagBadge(a.tag||a.category)+'</span>';
      html+='<span class="ri-status">'+statusLabel(a.status||'draft')+'</span>';
      html+='<span class="ri-date">'+formatDate(a.updated_at)+'</span></div>';
    });
    html+='</div>';
  }
  html+='</div>';main.innerHTML=html;
}

function statCard(num,label,navId){
  var oc=navId?' onclick="navigate(\''+navId+'\')"':'';
  return'<div class="admin-stat-card"'+oc+'><div class="stat-number">'+num+'</div><div class="stat-label">'+label+'</div></div>';
}

/* ========== ARTICLE LIST ========== */
function renderArticleList(){
  var main=document.getElementById('admin-main');
  var html='<div class="admin-page-list">';
  html+='<div class="admin-page-list-header"><h2>Articles</h2>';
  html+='<div class="admin-page-list-actions"><button class="btn-primary" onclick="showAddModal()">+ Nouvel article</button>';
  html+='<span class="list-count">'+articlesCache.length+' articles</span></div></div>';

  // Filters
  html+='<div class="filter-bar">';
  html+='<input type="text" id="article-search" placeholder="Rechercher..." oninput="filterArticles()">';
  html+='<select id="article-tag-filter" onchange="filterArticles()"><option value="">Tous les tags</option>';
  TAG_OPTIONS.forEach(function(t){html+='<option>'+t+'</option>'});
  html+='</select>';
  html+='<select id="article-status-filter" onchange="filterArticles()"><option value="">Tous statuts</option><option value="published">Publie</option><option value="draft">Brouillon</option><option value="archived">Archive</option></select>';
  html+='</div>';

  html+='<div class="table-scroll"><table class="admin-table"><thead><tr><th>Titre</th><th>Tag</th><th>SEO</th><th>GEO</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead><tbody id="article-tbody">';
  articlesCache.forEach(function(a){html+=articleRow(a)});
  html+='</tbody></table></div></div>';
  main.innerHTML=html;
}

function articleRow(a){
  var seo=analyzeSEO({title:a.title,metaTitle:a.meta_title||a.title,metaDescription:a.meta_description||'',slug:a.slug,focusKeyword:a.focus_keyword||'',sections:a.sections||[]});
  var geo=analyzeGEO({sections:a.sections||[]});
  var h='<tr data-title="'+escAttr(a.title||'')+'" data-tag="'+escAttr(a.tag||'')+'" data-status="'+escAttr(a.status||'draft')+'">';
  h+='<td class="page-title-cell" onclick="editArticle('+a.id+')">'+esc(a.title||'Sans titre')+'</td>';
  h+='<td>'+tagBadge(a.tag||a.category)+'</td>';
  h+='<td>'+scoreBadge(seo.score)+'</td>';
  h+='<td>'+scoreBadge(geo.score)+'</td>';
  h+='<td>'+statusLabel(a.status||'draft')+'</td>';
  h+='<td>'+formatDate(a.updated_at)+'</td>';
  h+='<td class="row-actions"><a href="javascript:void(0)" onclick="editArticle('+a.id+')">Modifier</a> ';
  if(a.status!=='published')h+='<a href="javascript:void(0)" class="action-delete" onclick="deleteArticle('+a.id+')">Supprimer</a>';
  h+='</td></tr>';
  return h;
}

window.filterArticles=function(){
  var search=normalize(document.getElementById('article-search').value);
  var tag=document.getElementById('article-tag-filter').value;
  var status=document.getElementById('article-status-filter').value;
  document.querySelectorAll('#article-tbody tr').forEach(function(tr){
    var t=normalize(tr.dataset.title);var tg=tr.dataset.tag;var st=tr.dataset.status;
    var show=(!search||t.indexOf(search)>=0)&&(!tag||tg===tag)&&(!status||st===status);
    tr.style.display=show?'':'none';
  });
};

/* ========== BLOCK SYSTEM ========== */
function newBlock(type){
  switch(type){
    case 'heading':return{type:'heading',level:'h2',text:''};
    case 'paragraph':return{type:'paragraph',html:''};
    case 'callout':return{type:'callout',variant:'info',html:''};
    case 'list':return{type:'list',style:'bullet',items:['']};
    case 'table':return{type:'table',headers:['',''],rows:[['','']]};
    case 'image':return{type:'image',src:'',alt:'',caption:''};
    case 'grid':return{type:'grid',columns:2,items:[{title:'',description:''}]};
    case 'stats-grid':return{type:'stats-grid',items:[{value:'',label:''}]};
    case 'faq':return{type:'faq',items:[{question:'',answer:''}]};
    case 'link-card':return{type:'link-card',title:'',description:'',href:''};
    default:return{type:'paragraph',html:''};
  }
}

function renderBlockItem(block,idx,prefix){
  prefix=prefix||'blk';
  var t=block.type;
  var h='<div class="block-item" data-idx="'+idx+'" data-type="'+t+'" id="'+prefix+'-'+idx+'">';
  h+='<div class="block-header"><span class="block-type-badge '+t+'">'+(t==='heading'?'H'+(block.level||'2').replace('h',''):BLOCK_TYPES.find(function(b){return b.type===t})?.badge||t.toUpperCase())+'</span>';
  h+='<span style="font-size:12px;color:var(--wp-text-light)">'+(BLOCK_TYPES.find(function(b){return b.type===t})?.label||t)+'</span>';
  h+='<div class="block-actions">';
  h+='<button onclick="moveBlock(\''+prefix+'\','+idx+',-1)" title="Monter">&#9650;</button>';
  h+='<button onclick="moveBlock(\''+prefix+'\','+idx+',1)" title="Descendre">&#9660;</button>';
  h+='<button class="block-delete" onclick="removeBlockItem(\''+prefix+'\','+idx+')" title="Supprimer">&#10005;</button>';
  h+='</div></div>';
  h+='<div class="block-body">';

  switch(t){
    case 'heading':
      h+='<div class="admin-field-row">';
      h+='<div class="admin-field" style="max-width:80px"><label>Niveau</label><select name="'+prefix+'_level_'+idx+'" onchange="markUnsaved()"><option value="h2"'+(block.level==='h2'?' selected':'')+'>H2</option><option value="h3"'+(block.level==='h3'?' selected':'')+'>H3</option></select></div>';
      h+='<div class="admin-field" style="flex:1"><label>Texte</label><input type="text" name="'+prefix+'_text_'+idx+'" value="'+escAttr(block.text||'')+'" oninput="markUnsaved()" placeholder="Titre de la section"></div>';
      h+='</div>';
      break;
    case 'paragraph':
      h+=richToolbar(prefix+'_html_'+idx);
      h+='<div class="admin-field"><textarea name="'+prefix+'_html_'+idx+'" oninput="markUnsaved()" rows="4" placeholder="Contenu HTML...">'+esc(block.html||'')+'</textarea></div>';
      break;
    case 'callout':
      h+='<div class="admin-field"><label>Type</label><select name="'+prefix+'_variant_'+idx+'" onchange="markUnsaved()"><option value="info"'+(block.variant==='info'?' selected':'')+'>Info</option><option value="warning"'+(block.variant==='warning'?' selected':'')+'>Warning</option></select></div>';
      h+=richToolbar(prefix+'_chtml_'+idx);
      h+='<div class="admin-field"><textarea name="'+prefix+'_chtml_'+idx+'" oninput="markUnsaved()" rows="3" placeholder="Contenu HTML...">'+esc(block.html||'')+'</textarea></div>';
      break;
    case 'list':
      h+='<div class="admin-field"><label>Style</label><select name="'+prefix+'_lstyle_'+idx+'" onchange="markUnsaved()"><option value="bullet"'+((block.style||'bullet')==='bullet'?' selected':'')+'>Puces</option><option value="numbered"'+(block.style==='numbered'?' selected':'')+'>Numerotee</option></select></div>';
      h+='<div id="'+prefix+'_litems_'+idx+'">';
      (block.items||['']).forEach(function(item,j){
        h+='<div class="dyn-item"><input type="text" name="'+prefix+'_li_'+idx+'_'+j+'" value="'+escAttr(item)+'" oninput="markUnsaved()" placeholder="Element..."><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>';
      });
      h+='</div>';
      h+='<button class="btn-add" onclick="addListItem(\''+prefix+'\','+idx+')">+ Element</button>';
      break;
    case 'table':
      var headers=block.headers||['',''];var rows=block.rows||[['','']];
      h+='<div class="admin-field"><label>En-tetes ('+headers.length+' colonnes)</label>';
      h+='<div id="'+prefix+'_theaders_'+idx+'" style="display:flex;gap:4px">';
      headers.forEach(function(hd,j){h+='<input type="text" name="'+prefix+'_th_'+idx+'_'+j+'" value="'+escAttr(hd)+'" oninput="markUnsaved()" style="flex:1" placeholder="Col '+(j+1)+'">'});
      h+='</div></div>';
      h+='<div class="admin-field"><label>Lignes ('+rows.length+')</label><div id="'+prefix+'_trows_'+idx+'">';
      rows.forEach(function(row,j){
        h+='<div style="display:flex;gap:4px;margin-bottom:4px">';
        row.forEach(function(cell,k){h+='<input type="text" name="'+prefix+'_td_'+idx+'_'+j+'_'+k+'" value="'+escAttr(cell)+'" oninput="markUnsaved()" style="flex:1">'});
        h+='<button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>';
      });
      h+='</div>';
      h+='<button class="btn-add" onclick="addTableRow(\''+prefix+'\','+idx+','+headers.length+')">+ Ligne</button>';
      h+='</div>';
      break;
    case 'image':
      h+=field(prefix+'_src_'+idx,'URL image',block.src||'','url');
      h+=field(prefix+'_alt_'+idx,'Texte alt',block.alt||'','text','Description de l\'image pour SEO');
      h+=field(prefix+'_caption_'+idx,'Legende',block.caption||'','text');
      break;
    case 'grid':
      h+='<div class="admin-field"><label>Colonnes</label><select name="'+prefix+'_gcols_'+idx+'" onchange="markUnsaved()"><option value="2"'+(block.columns===2?' selected':'')+'>2</option><option value="3"'+(block.columns===3?' selected':'')+'>3</option></select></div>';
      h+='<div id="'+prefix+'_gitems_'+idx+'">';
      (block.items||[]).forEach(function(item,j){
        h+='<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>';
        h+=field(prefix+'_gt_'+idx+'_'+j,'Titre',item.title||'','text');
        h+=field(prefix+'_gd_'+idx+'_'+j,'Description',item.description||'','textarea');
        h+='</div>';
      });
      h+='</div>';
      h+='<button class="btn-add" onclick="addGridItem(\''+prefix+'\','+idx+')">+ Element</button>';
      break;
    case 'stats-grid':
      h+='<div id="'+prefix+'_sitems_'+idx+'">';
      (block.items||[]).forEach(function(item,j){
        h+='<div class="dyn-item"><input type="text" name="'+prefix+'_sv_'+idx+'_'+j+'" value="'+escAttr(item.value||'')+'" oninput="markUnsaved()" placeholder="Valeur" style="max-width:100px"><input type="text" name="'+prefix+'_sl_'+idx+'_'+j+'" value="'+escAttr(item.label||'')+'" oninput="markUnsaved()" placeholder="Label"><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>';
      });
      h+='</div>';
      h+='<button class="btn-add" onclick="addStatsItem(\''+prefix+'\','+idx+')">+ Stat</button>';
      break;
    case 'faq':
      h+='<div id="'+prefix+'_faqitems_'+idx+'">';
      (block.items||[]).forEach(function(item,j){
        h+='<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>';
        h+=field(prefix+'_fq_'+idx+'_'+j,'Question',item.question||'','text');
        h+='<div class="admin-field"><label>Reponse</label><textarea name="'+prefix+'_fa_'+idx+'_'+j+'" oninput="markUnsaved()" rows="3">'+esc(item.answer||'')+'</textarea></div>';
        h+='</div>';
      });
      h+='</div>';
      h+='<button class="btn-add" onclick="addFaqItem(\''+prefix+'\','+idx+')">+ Question</button>';
      break;
    case 'link-card':
      h+=field(prefix+'_lct_'+idx,'Titre',block.title||'','text');
      h+=field(prefix+'_lcd_'+idx,'Description',block.description||'','text');
      h+=field(prefix+'_lch_'+idx,'URL',block.href||'','url');
      break;
  }
  h+='</div></div>';
  return h;
}

function richToolbar(targetName){
  return'<div class="rich-toolbar">'+
    '<button type="button" onclick="wrapTag(\''+targetName+'\',\'strong\')"><b>G</b></button>'+
    '<button type="button" onclick="wrapTag(\''+targetName+'\',\'em\')"><i>I</i></button>'+
    '<button type="button" onclick="insertLink(\''+targetName+'\')">&#128279; Lien</button></div>';
}

window.wrapTag=function(name,tag){
  var el=document.querySelector('[name="'+name+'"]');if(!el)return;
  var s=el.selectionStart,e=el.selectionEnd,v=el.value;
  var sel=v.substring(s,e)||'texte';
  el.value=v.substring(0,s)+'<'+tag+'>'+sel+'</'+tag+'>'+v.substring(e);
  el.focus();markUnsaved();
};

window.insertLink=function(name){
  var url=prompt('URL du lien :','https://');if(!url)return;
  var text=prompt('Texte du lien :','cliquez ici');if(!text)return;
  var el=document.querySelector('[name="'+name+'"]');if(!el)return;
  var s=el.selectionStart,v=el.value;
  el.value=v.substring(0,s)+'<a href="'+url+'">'+text+'</a>'+v.substring(s);
  el.focus();markUnsaved();
};

/* Block dynamic actions */
window.addBlockToList=function(type,prefix){
  var list=document.getElementById(prefix+'-list');if(!list)return;
  var idx=list.children.length;
  list.insertAdjacentHTML('beforeend',renderBlockItem(newBlock(type),idx,prefix));
  markUnsaved();
};

window.moveBlock=function(prefix,idx,dir){
  var list=document.getElementById(prefix+'-list');if(!list)return;
  var items=list.children;if(!items[idx])return;
  var target=idx+dir;if(target<0||target>=items.length)return;
  if(dir===-1)list.insertBefore(items[idx],items[target]);
  else list.insertBefore(items[target],items[idx]);
  reindexBlocks(prefix);markUnsaved();
};

window.removeBlockItem=function(prefix,idx){
  var el=document.getElementById(prefix+'-'+idx);
  if(el)el.remove();markUnsaved();
};

function reindexBlocks(prefix){
  var list=document.getElementById(prefix+'-list');if(!list)return;
  Array.from(list.children).forEach(function(el,i){el.dataset.idx=i;el.id=prefix+'-'+i});
}

window.addListItem=function(prefix,idx){
  var container=document.getElementById(prefix+'_litems_'+idx);if(!container)return;
  var j=container.children.length;
  container.insertAdjacentHTML('beforeend','<div class="dyn-item"><input type="text" name="'+prefix+'_li_'+idx+'_'+j+'" oninput="markUnsaved()" placeholder="Element..."><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>');
  markUnsaved();
};

window.addTableRow=function(prefix,idx,cols){
  var container=document.getElementById(prefix+'_trows_'+idx);if(!container)return;
  var j=container.children.length;
  var h='<div style="display:flex;gap:4px;margin-bottom:4px">';
  for(var k=0;k<cols;k++)h+='<input type="text" name="'+prefix+'_td_'+idx+'_'+j+'_'+k+'" oninput="markUnsaved()" style="flex:1">';
  h+='<button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>';
  container.insertAdjacentHTML('beforeend',h);markUnsaved();
};

window.addGridItem=function(prefix,idx){
  var container=document.getElementById(prefix+'_gitems_'+idx);if(!container)return;
  var j=container.children.length;
  container.insertAdjacentHTML('beforeend','<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>'+
    field(prefix+'_gt_'+idx+'_'+j,'Titre','','text')+field(prefix+'_gd_'+idx+'_'+j,'Description','','textarea')+'</div>');
  markUnsaved();
};

window.addStatsItem=function(prefix,idx){
  var container=document.getElementById(prefix+'_sitems_'+idx);if(!container)return;
  var j=container.children.length;
  container.insertAdjacentHTML('beforeend','<div class="dyn-item"><input type="text" name="'+prefix+'_sv_'+idx+'_'+j+'" oninput="markUnsaved()" placeholder="Valeur" style="max-width:100px"><input type="text" name="'+prefix+'_sl_'+idx+'_'+j+'" oninput="markUnsaved()" placeholder="Label"><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>');
  markUnsaved();
};

window.addFaqItem=function(prefix,idx){
  var container=document.getElementById(prefix+'_faqitems_'+idx);if(!container)return;
  var j=container.children.length;
  container.insertAdjacentHTML('beforeend','<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>'+
    field(prefix+'_fq_'+idx+'_'+j,'Question','','text')+'<div class="admin-field"><label>Reponse</label><textarea name="'+prefix+'_fa_'+idx+'_'+j+'" oninput="markUnsaved()" rows="3"></textarea></div></div>');
  markUnsaved();
};

/* ========== COLLECT BLOCKS FROM DOM ========== */
function collectBlocks(prefix){
  var list=document.getElementById(prefix+'-list');if(!list)return[];
  var blocks=[];
  Array.from(list.children).forEach(function(el){
    var type=el.dataset.type;var idx=el.dataset.idx;
    var block={type:type};
    switch(type){
      case 'heading':
        block.level=getElVal(el,'[name$="_level_'+idx+'"]')||'h2';
        block.text=getElVal(el,'[name$="_text_'+idx+'"]');
        break;
      case 'paragraph':
        block.html=getElVal(el,'[name$="_html_'+idx+'"]');
        break;
      case 'callout':
        block.variant=getElVal(el,'[name$="_variant_'+idx+'"]')||'info';
        block.html=getElVal(el,'[name$="_chtml_'+idx+'"]');
        break;
      case 'list':
        block.style=getElVal(el,'[name$="_lstyle_'+idx+'"]')||'bullet';
        block.items=[];
        el.querySelectorAll('[name^="'+prefix+'_li_'+idx+'_"]').forEach(function(inp){if(inp.value.trim())block.items.push(inp.value.trim())});
        break;
      case 'table':
        block.headers=[];block.rows=[];
        el.querySelectorAll('[name^="'+prefix+'_th_'+idx+'_"]').forEach(function(inp){block.headers.push(inp.value.trim())});
        var rowContainer=el.querySelector('#'+prefix+'_trows_'+idx);
        if(rowContainer)Array.from(rowContainer.children).forEach(function(rowEl){
          var cells=[];rowEl.querySelectorAll('input').forEach(function(inp){cells.push(inp.value.trim())});
          if(cells.length)block.rows.push(cells);
        });
        break;
      case 'image':
        block.src=getElVal(el,'[name$="_src_'+idx+'"]');
        block.alt=getElVal(el,'[name$="_alt_'+idx+'"]');
        block.caption=getElVal(el,'[name$="_caption_'+idx+'"]');
        break;
      case 'grid':
        block.columns=parseInt(getElVal(el,'[name$="_gcols_'+idx+'"]'))||2;
        block.items=[];
        var gitems=el.querySelector('#'+prefix+'_gitems_'+idx);
        if(gitems)Array.from(gitems.children).forEach(function(itemEl,j){
          block.items.push({title:getElVal(itemEl,'[name$="_gt_'+idx+'_'+j+'"]'),description:getElVal(itemEl,'[name$="_gd_'+idx+'_'+j+'"]')});
        });
        break;
      case 'stats-grid':
        block.items=[];
        var sitems=el.querySelector('#'+prefix+'_sitems_'+idx);
        if(sitems)Array.from(sitems.children).forEach(function(itemEl,j){
          var v=getElVal(itemEl,'[name$="_sv_'+idx+'_'+j+'"]');var l=getElVal(itemEl,'[name$="_sl_'+idx+'_'+j+'"]');
          if(v||l)block.items.push({value:v,label:l});
        });
        break;
      case 'faq':
        block.items=[];
        var faqC=el.querySelector('#'+prefix+'_faqitems_'+idx);
        if(faqC)Array.from(faqC.children).forEach(function(itemEl,j){
          block.items.push({question:getElVal(itemEl,'[name$="_fq_'+idx+'_'+j+'"]'),answer:getElVal(itemEl,'[name$="_fa_'+idx+'_'+j+'"]')});
        });
        break;
      case 'link-card':
        block.title=getElVal(el,'[name$="_lct_'+idx+'"]');
        block.description=getElVal(el,'[name$="_lcd_'+idx+'"]');
        block.href=getElVal(el,'[name$="_lch_'+idx+'"]');
        break;
    }
    blocks.push(block);
  });
  return blocks;
}

function getElVal(parent,sel){var el=parent.querySelector(sel);return el?el.value.trim():''}

/* ========== ARTICLE EDITOR ========== */
async function loadArticleData(id){
  var main=document.getElementById('admin-main');
  main.innerHTML='<div style="padding:60px;text-align:center;color:#787c82">Chargement...</div>';
  var r=await sb.from(TABLE).select('*').eq('id',id).maybeSingle();
  state.articleData=r.data;renderArticleEditor();
}

function renderArticleEditor(){
  var d=state.articleData||{};
  var main=document.getElementById('admin-main');
  var html='<div class="admin-editor">';

  html+='<div class="admin-editor-breadcrumb"><a href="javascript:void(0)" onclick="navigate(\'dashboard\')">Tableau de bord</a> &rsaquo; <a href="javascript:void(0)" onclick="navigate(\'articles\')">Articles</a> &rsaquo; '+esc(d.title||'Nouvel article')+'</div>';
  html+='<div class="admin-editor-header"><h2>'+esc(d.title||'Nouvel article')+'</h2>';
  html+='<button class="btn-back" onclick="navigate(\'articles\')">&larr; Retour</button>';
  html+='<button class="btn-preview" onclick="showArticlePreview()">&#128065; Preview</button>';
  html+='<button class="btn-ai-regen" onclick="regenerateArticle()">&#129302; Regenerer IA</button>';
  html+='</div>';

  html+='<div class="admin-editor-layout"><div class="admin-editor-content">';

  // General info
  html+=metaBoxOpen('Informations generales',false);
  html+=field('art_title','Titre (H1)',d.title||'','text');
  html+=field('art_meta_title','Titre SEO',d.meta_title||'','text','50-60 caracteres. Si vide, utilise le H1.');
  html+=field('art_meta_desc','Meta description',d.meta_description||'','textarea','120-160 caracteres recommandes.');
  html+=field('art_excerpt','Extrait',d.excerpt||'','textarea','Resume court visible dans le hero.');
  html+='<div class="admin-field-row">';
  html+='<div class="admin-field"><label>Tag</label><select name="art_tag" onchange="markUnsaved()">';
  TAG_OPTIONS.forEach(function(t){html+='<option'+(d.tag===t?' selected':'')+'>'+t+'</option>'});
  html+='</select></div>';
  html+='<div class="admin-field"><label>Slug</label><input type="text" name="art_slug" value="'+escAttr(d.slug||'')+'" oninput="markUnsaved()"></div>';
  html+='</div>';
  html+=field('art_focus_kw','Mot-cle focus',d.focus_keyword||'','text','Mot-cle principal pour l\'analyse SEO');
  html+=metaBoxClose();

  // Blocks
  var sections=d.sections||[];
  html+=metaBoxOpen('Contenu ('+sections.length+' blocs)',false);
  html+='<div id="art-list">';
  sections.forEach(function(block,i){html+=renderBlockItem(block,i,'art')});
  html+='</div>';
  html+='<div class="add-block-menu">';
  BLOCK_TYPES.forEach(function(bt){
    html+='<button class="add-block-btn" onclick="addBlockToList(\''+bt.type+'\',\'art\')">'+bt.badge+' '+bt.label+'</button>';
  });
  html+='</div>';
  html+=metaBoxClose();

  html+='</div>'; // end content

  // Sidebar
  html+='<div class="admin-editor-sidebar">';

  // Publish box
  html+='<div class="admin-publish-box"><div class="admin-publish-box-header">Publier</div>';
  html+='<div class="admin-publish-box-body">';
  html+='<div class="admin-field"><label>Statut</label><select name="art_status" onchange="markUnsaved()">';
  ['draft','published','archived'].forEach(function(s){html+='<option value="'+s+'"'+((d.status||'draft')===s?' selected':'')+'>'+(s==='draft'?'Brouillon':s==='published'?'Publie':'Archive')+'</option>'});
  html+='</select></div>';
  if(d.updated_at)html+='<div class="pub-info">Modifie : <strong>'+formatDate(d.updated_at)+'</strong></div>';
  if(d.published_at)html+='<div class="pub-info">Publie : <strong>'+formatDate(d.published_at)+'</strong></div>';
  html+='</div>';
  html+='<div class="admin-publish-box-footer"><button class="btn-primary" onclick="saveArticle()" id="btn-save">Sauvegarder</button></div></div>';

  // Score panel
  html+='<div class="admin-score-panel"><div class="score-panel-header" onclick="var b=this.nextElementSibling;b.style.display=b.style.display===\'none\'?\'\':\'none\'">Optimisation SEO/GEO <span class="toggle-icon">&#9660;</span></div>';
  html+='<div class="score-panel-body" id="score-panel-body">';
  html+='<div class="score-summary" id="score-summary"></div>';
  html+='<button class="btn-improve" onclick="improveArticle()">&#10024; Ameliorer avec l\'IA</button>';
  html+='<div class="score-checks" id="score-checks"></div>';
  html+='</div></div>';

  html+='</div>'; // end sidebar
  html+='</div></div>'; // end layout, editor

  main.innerHTML=html;main.scrollTop=0;
  updateArticleScorePanel();bindScoreUpdates();
}

/* Score panel updates */
var _scoreTimer=null;

function collectArticleFormData(){
  return{
    title:getVal('art_title'),meta_title:getVal('art_meta_title'),meta_description:getVal('art_meta_desc'),
    excerpt:getVal('art_excerpt'),tag:getVal('art_tag'),slug:getVal('art_slug'),
    focus_keyword:getVal('art_focus_kw'),status:getVal('art_status'),
    sections:collectBlocks('art')
  };
}

function updateArticleScorePanel(){
  var d=collectArticleFormData();
  var seo=analyzeSEO({title:d.title,metaTitle:d.meta_title||d.title,metaDescription:d.meta_description,slug:d.slug,focusKeyword:d.focus_keyword,sections:d.sections});
  var geo=analyzeGEO({sections:d.sections});

  var sumEl=document.getElementById('score-summary');
  if(sumEl)sumEl.innerHTML='<div class="score-row"><span>SEO</span>'+scoreBadge(seo.score)+'</div><div class="score-row"><span>GEO</span>'+scoreBadge(geo.score)+'</div>';

  var c='<div class="score-check-label">SEO — Base</div>';
  seo.checks.filter(function(ch){return ch.cat==='basic'}).forEach(function(ch){c+=chk(ch.passed,ch.label,ch.msg)});
  c+='<div class="score-check-label">SEO — Contenu</div>';
  seo.checks.filter(function(ch){return ch.cat==='content'}).forEach(function(ch){c+=chk(ch.passed,ch.label,ch.msg)});
  c+='<div class="score-check-label">SEO — Liens & Media</div>';
  seo.checks.filter(function(ch){return ch.cat==='links'}).forEach(function(ch){c+=chk(ch.passed,ch.label,ch.msg)});
  c+='<div class="score-check-label">GEO</div>';
  geo.checks.forEach(function(ch){c+=chk(ch.passed,ch.label,ch.msg)});

  var chEl=document.getElementById('score-checks');
  if(chEl)chEl.innerHTML=c;
}

function chk(pass,label,msg){return'<div class="score-check '+(pass?'pass':'fail')+'"><span>'+(pass?'&#10003;':'&#10007;')+'</span><span title="'+escAttr(msg)+'">'+label+'</span></div>'}

function bindScoreUpdates(){
  var content=document.querySelector('.admin-editor-content');if(!content)return;
  content.addEventListener('input',function(){clearTimeout(_scoreTimer);_scoreTimer=setTimeout(updateArticleScorePanel,500)});
  var list=document.getElementById('art-list');
  if(list)new MutationObserver(function(){clearTimeout(_scoreTimer);_scoreTimer=setTimeout(updateArticleScorePanel,300)}).observe(list,{childList:true,subtree:true});
}

/* Save article */
window.saveArticle=async function(){
  var btn=document.getElementById('btn-save');btn.disabled=true;btn.textContent='Sauvegarde...';
  try{
    var d=collectArticleFormData();
    var data={
      title:d.title||null,meta_title:d.meta_title||null,meta_description:d.meta_description||null,
      excerpt:d.excerpt||null,subtitle:d.excerpt||null,slug:d.slug||null,
      tag:d.tag||'Guide',focus_keyword:d.focus_keyword||null,
      status:d.status||'draft',sections:d.sections,
      read_time:Math.max(1,Math.round(countWords(extractTextFromBlocks(d.sections))/200))+' min',
      updated_at:new Date().toISOString()
    };
    if(d.status==='published'&&!(state.articleData||{}).published_at)data.published_at=new Date().toISOString();
    // Compute scores
    var seo=analyzeSEO({title:d.title,metaTitle:d.meta_title||d.title,metaDescription:d.meta_description,slug:d.slug,focusKeyword:d.focus_keyword,sections:d.sections});
    var geo=analyzeGEO({sections:d.sections});
    data.seo_score=seo.score;data.geo_score=geo.score;

    var r=await sb.from(TABLE).update(data).eq('id',state.currentId);
    if(r.error)throw r.error;
    state.unsaved=false;await loadArticles();
    // Refresh local data
    state.articleData=Object.assign({},state.articleData,data);
    showToast('Article sauvegarde','success');
  }catch(err){console.error(err);showToast('Erreur : '+(err.message||'Echec'),'error')}
  btn.disabled=false;btn.textContent='Sauvegarder';
};

/* Delete article */
window.deleteArticle=async function(id){
  if(!confirm('Supprimer cet article ?'))return;
  try{var r=await sb.from(TABLE).delete().eq('id',id);if(r.error)throw r.error;await loadArticles();showToast('Article supprime','success');navigate('articles')}catch(err){showToast('Erreur : '+(err.message||'Echec'),'error')}
};

/* Add article modal */
window.showAddModal=function(){
  var html='<div class="admin-modal-overlay" id="add-modal" onclick="if(event.target===this)closeAddModal()">';
  html+='<div class="admin-modal admin-modal-wide"><h3>Nouvel article</h3>';
  html+=field('new_title','Titre','','text');
  html+='<div class="admin-field-row">';
  html+='<div class="admin-field"><label>Tag</label><select id="new-tag">';TAG_OPTIONS.forEach(function(t){html+='<option>'+t+'</option>'});html+='</select></div>';
  html+='<div class="admin-field"><label>Mot-cle focus</label><input type="text" id="new-kw" placeholder="Ex: prepa medecine"></div>';
  html+='</div>';

  // AI source
  html+='<div class="ai-source-section"><div class="ai-source-header">&#129302; Generation IA (optionnel)</div>';
  html+='<div class="admin-field"><label>URL source</label><input type="url" id="ai-source-url" placeholder="https://example.com/article"></div></div>';

  html+='<div class="admin-modal-actions">';
  html+='<button class="btn-secondary" onclick="closeAddModal()">Annuler</button>';
  html+='<button class="btn-primary btn-ai-generate" onclick="createArticle()">Creer</button>';
  html+='</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  document.querySelector('[name="new_title"]').focus();
};

window.closeAddModal=function(){var m=document.getElementById('add-modal');if(m)m.remove()};

window.createArticle=async function(){
  var title=getVal('new_title');if(!title){showToast('Titre requis','error');return}
  var tag=document.getElementById('new-tag').value;
  var kw=(document.getElementById('new-kw').value||'').trim();
  var sourceUrl=(document.getElementById('ai-source-url').value||'').trim();
  var slug=slugify(title);
  var btn=document.querySelector('#add-modal .btn-primary');btn.disabled=true;
  var useAI=!!sourceUrl;
  if(useAI)showAIOverlay('Generation IA en cours...<br><small>~20-30 secondes</small>');

  try{
    var insertData={slug:slug,title:title,tag:tag,focus_keyword:kw||null,status:'draft',meta_title:title,sections:[]};
    var r=await sb.from(TABLE).insert(insertData).select().single();
    if(r.error)throw r.error;
    var newId=r.data.id;

    if(useAI){
      try{
        var existing=articlesCache.map(function(a){return{title:a.title,slug:a.slug}});
        var aiRes=await fetch(SUPABASE_URL+'/functions/v1/generate-article',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title,source_url:sourceUrl,existing_articles:existing})});
        var aiData=await aiRes.json();
        if(!aiData.error){
          var update={title:aiData.title||title,meta_description:aiData.meta_description||null,subtitle:aiData.subtitle||null,sections:aiData.sections||[],faq:aiData.faq||[]};
          await sb.from(TABLE).update(update).eq('id',newId);
          showToast('Article genere par IA','success');
        }else{showToast('IA: '+aiData.error,'error')}
      }catch(e){showToast('Erreur IA','error')}
    }

    hideAIOverlay();closeAddModal();await loadArticles();editArticle(newId);
  }catch(err){hideAIOverlay();showToast('Erreur : '+(err.message||'Echec'),'error');btn.disabled=false}
};

/* Regenerate & Improve */
window.regenerateArticle=async function(){
  if(!state.currentId)return;
  var title=getVal('art_title');if(!title){showToast('Titre requis','error');return}
  if(!confirm('Regenerer avec l\'IA ? Le contenu sera remplace.'))return;
  showAIOverlay('Regeneration en cours...');
  try{
    var existing=articlesCache.filter(function(a){return a.id!==state.currentId}).map(function(a){return{title:a.title,slug:a.slug}});
    var res=await fetch(SUPABASE_URL+'/functions/v1/generate-article',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title,existing_articles:existing})});
    var data=await res.json();
    if(data.error){hideAIOverlay();showToast('Erreur IA','error');return}
    var update={title:data.title||title,meta_description:data.meta_description||null,subtitle:data.subtitle||null,sections:data.sections||[],faq:data.faq||[]};
    await sb.from(TABLE).update(update).eq('id',state.currentId);
    hideAIOverlay();showToast('Article regenere','success');await loadArticles();editArticle(state.currentId);
  }catch(err){hideAIOverlay();showToast('Erreur','error')}
};

window.improveArticle=async function(){
  if(!state.currentId)return;
  var d=collectArticleFormData();if(!d.title){showToast('Titre requis','error');return}
  if(!confirm('Ameliorer avec l\'IA ?'))return;
  showAIOverlay('Amelioration en cours...');
  try{
    var seo=analyzeSEO({title:d.title,metaTitle:d.meta_title||d.title,metaDescription:d.meta_description,slug:d.slug,focusKeyword:d.focus_keyword,sections:d.sections});
    var geo=analyzeGEO({sections:d.sections});
    var res=await fetch(SUPABASE_URL+'/functions/v1/improve-article',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:d.title,meta_description:d.meta_description,subtitle:d.excerpt,sections:d.sections,faq:[],scores:{seo:seo.score,geo:geo.score}})});
    var data=await res.json();
    if(data.error){hideAIOverlay();showToast('Erreur IA','error');return}
    var update={title:data.title||d.title,meta_description:data.meta_description||null,subtitle:data.subtitle||null,sections:data.sections||d.sections};
    await sb.from(TABLE).update(update).eq('id',state.currentId);
    hideAIOverlay();showToast('Article ameliore','success');await loadArticles();editArticle(state.currentId);
  }catch(err){hideAIOverlay();showToast('Erreur','error')}
};

/* ========== ARTICLE PREVIEW ========== */
window.showArticlePreview=function(){
  var d=collectArticleFormData();
  var html='<div class="preview-overlay" id="preview-overlay" onclick="if(event.target===this)this.remove()">';
  html+='<div class="preview-container"><div class="preview-close"><button onclick="document.getElementById(\'preview-overlay\').remove()">&#10005; Fermer</button></div>';
  html+='<div class="preview-body">';

  // Tag
  if(d.tag)html+='<div class="preview-tag" style="background:'+(TAG_COLORS[d.tag]||'#6b7280')+'">'+esc(d.tag)+'</div>';
  // Title
  html+='<h1>'+esc(d.title||'Sans titre')+'</h1>';
  if(d.excerpt)html+='<p class="preview-excerpt">'+esc(d.excerpt)+'</p>';

  // TOC
  var h2s=(d.sections||[]).filter(function(s){return s.type==='heading'&&s.level==='h2'});
  if(h2s.length>=2){
    html+='<div class="preview-toc"><h3>Sommaire</h3>';
    h2s.forEach(function(h,i){html+='<a href="javascript:void(0)">'+esc(h.text)+'</a>'});
    html+='</div>';
  }

  // Blocks
  (d.sections||[]).forEach(function(block){html+=renderPreviewBlock(block)});
  html+='</div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
};

function renderPreviewBlock(block){
  switch(block.type){
    case 'heading':return'<'+(block.level||'h2')+'>'+esc(block.text||'')+'</'+(block.level||'h2')+'>';
    case 'paragraph':return'<p>'+(block.html||'')+'</p>';
    case 'callout':return'<div class="preview-callout'+(block.variant==='warning'?' warning':'')+'">'+(block.html||'')+'</div>';
    case 'list':
      var tag=block.style==='numbered'?'ol':'ul';
      return'<'+tag+'>'+(block.items||[]).map(function(i){return'<li>'+i+'</li>'}).join('')+'</'+tag+'>';
    case 'table':
      var h='<div style="overflow-x:auto"><table><thead><tr>'+(block.headers||[]).map(function(hd){return'<th>'+esc(hd)+'</th>'}).join('')+'</tr></thead><tbody>';
      (block.rows||[]).forEach(function(row){h+='<tr>'+row.map(function(c){return'<td>'+esc(c)+'</td>'}).join('')+'</tr>'});
      return h+'</tbody></table></div>';
    case 'image':
      var h='';if(block.src)h+='<img src="'+escAttr(block.src)+'" alt="'+escAttr(block.alt||'')+'" style="max-width:100%;border-radius:6px;margin:12px 0">';
      if(block.caption)h+='<p style="font-size:12px;color:#6b7280;text-align:center;margin-top:4px">'+esc(block.caption)+'</p>';
      return h;
    case 'grid':
      var cols=block.columns||2;
      var h='<div class="preview-grid" style="grid-template-columns:repeat('+cols+',1fr)">';
      (block.items||[]).forEach(function(i){h+='<div class="preview-grid-item"><h4>'+esc(i.title)+'</h4><p>'+esc(i.description)+'</p></div>'});
      return h+'</div>';
    case 'stats-grid':
      var h='<div class="preview-grid" style="grid-template-columns:repeat(3,1fr)">';
      (block.items||[]).forEach(function(i){h+='<div class="preview-grid-item" style="text-align:center"><div style="font-size:24px;font-weight:700;color:var(--wp-accent)">'+esc(i.value)+'</div><p>'+esc(i.label)+'</p></div>'});
      return h+'</div>';
    case 'faq':
      var h='<div class="preview-faq">';
      (block.items||[]).forEach(function(i){h+='<details><summary>'+esc(i.question)+'</summary><div class="faq-answer">'+esc(i.answer)+'</div></details>'});
      return h+'</div>';
    case 'link-card':
      return'<a class="preview-link-card" href="'+escAttr(block.href||'#')+'"><h4>'+esc(block.title)+'</h4><p>'+esc(block.description)+'</p></a>';
    default:return'';
  }
}

/* ========== PREPAS MANAGEMENT ========== */
function renderPrepaList(){
  var main=document.getElementById('admin-main');
  var html='<div class="admin-page-list">';
  html+='<div class="admin-page-list-header"><h2>Prepas</h2>';
  html+='<div class="admin-page-list-actions"><button class="btn-primary" onclick="showAddPrepaModal()">+ Nouvelle prepa</button>';
  html+='<span class="list-count">'+prepasCache.length+' prepas</span></div></div>';
  html+='<div class="table-scroll"><table class="admin-table"><thead><tr><th>Nom</th><th>Ville</th><th>Format</th><th>Taux</th><th>Featured</th><th>Coup de coeur</th><th>Actions</th></tr></thead><tbody>';
  prepasCache.forEach(function(p){
    html+='<tr><td class="page-title-cell" onclick="editPrepa('+p.id+')">'+esc(p.name)+'</td>';
    html+='<td>'+esc(p.ville||'')+'</td><td>'+esc(p.format||'')+'</td><td>'+esc(p.taux||'')+'</td>';
    html+='<td>'+(p.featured?'<span class="status-dot published"></span>Oui':'Non')+'</td>';
    html+='<td>'+(p.coup_de_coeur?'<span style="color:#046bd2;font-weight:700">&#10084;</span>':'Non')+'</td>';
    html+='<td class="row-actions"><a href="javascript:void(0)" onclick="editPrepa('+p.id+')">Modifier</a> <a href="javascript:void(0)" class="action-delete" onclick="deletePrepa('+p.id+')">Supprimer</a></td></tr>';
  });
  html+='</tbody></table></div></div>';main.innerHTML=html;
}

async function loadPrepaData(id){
  var main=document.getElementById('admin-main');
  main.innerHTML='<div style="padding:60px;text-align:center;color:#787c82">Chargement...</div>';
  var r=await sb.from(TABLE_PREPAS).select('*').eq('id',id).maybeSingle();
  state.prepaData=r.data;renderPrepaEditor();
}

function renderPrepaEditor(){
  var d=state.prepaData||{};
  var main=document.getElementById('admin-main');
  var html='<div class="admin-editor">';
  html+='<div class="admin-editor-breadcrumb"><a href="javascript:void(0)" onclick="navigate(\'dashboard\')">Tableau de bord</a> &rsaquo; <a href="javascript:void(0)" onclick="navigate(\'prepas\')">Prepas</a> &rsaquo; '+esc(d.name||'Nouvelle prepa')+'</div>';
  html+='<div class="admin-editor-header"><h2>'+esc(d.name||'Nouvelle prepa')+'</h2>';
  html+='<button class="btn-back" onclick="navigate(\'prepas\')">&larr; Retour</button></div>';
  html+='<div class="admin-editor-layout"><div class="admin-editor-content">';

  // General
  html+=metaBoxOpen('Informations generales',false);
  html+=field('p_name','Nom',d.name||'','text');
  html+=field('p_slug','Slug',d.slug||'','text');
  html+='<div class="admin-field-row">';
  html+=field('p_ville','Ville',d.ville||'','text');
  html+=field('p_villes','Toutes villes',(d.villes||[]).join(', '),'text','Separees par virgules');
  html+='</div>';
  html+='<div class="admin-field-row">';
  html+=field('p_taux','Taux',d.taux||'','text');
  html+=field('p_anciennete','Anciennete',d.anciennete||'','text');
  html+=field('p_etudiants','Etudiants',d.etudiants||'','text');
  html+='</div>';
  html+='<div class="admin-field"><label>Format</label><select name="p_format" onchange="markUnsaved()">';
  ['Présentiel','En ligne','Hybride'].forEach(function(f){html+='<option'+(d.format===f?' selected':'')+'>'+f+'</option>'});
  html+='</select></div>';
  html+=field('p_intro','Introduction',d.intro||'','textarea');
  html+=field('p_avis','Avis editorial',d.avis||'','textarea');
  html+=metaBoxClose();

  // Filieres
  html+=metaBoxOpen('Filieres & Tags',false);
  var allFil=['PASS','LAS','LSPS','Terminale Santé','Première Santé','P0','Internat'];
  html+='<div class="admin-field"><label>Filieres</label><div style="display:flex;flex-wrap:wrap;gap:8px">';
  var curFil=d.filieres||[];
  allFil.forEach(function(f){html+='<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" class="p_filiere" value="'+f+'"'+(curFil.indexOf(f)>=0?' checked':'')+' onchange="markUnsaved()"> '+f+'</label>'});
  html+='</div></div>';
  html+=field('p_tags','Tags',(d.tags||[]).join(', '),'text','Separees par virgules');
  html+=metaBoxClose();

  // Stats
  var stats=d.stats||[];
  html+=metaBoxOpen('Statistiques ('+stats.length+')',false);
  html+='<div id="prepa-stats-list">';
  stats.forEach(function(s,i){
    html+='<div class="dyn-item"><input type="text" name="ps_val_'+i+'" value="'+escAttr(s.val||'')+'" oninput="markUnsaved()" placeholder="Valeur" style="max-width:100px"><input type="text" name="ps_lbl_'+i+'" value="'+escAttr(s.lbl||'')+'" oninput="markUnsaved()" placeholder="Label"><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>';
  });
  html+='</div><button class="btn-add" onclick="addPrepaDynItem(\'prepa-stats-list\',\'ps\')">+ Stat</button>';
  html+=metaBoxClose();

  // Modele
  var modele=d.modele||[];
  html+=metaBoxOpen('Modele ('+modele.length+')',false);
  html+='<div id="prepa-modele-list">';
  modele.forEach(function(m,i){
    html+='<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>'+
      field('pm_t_'+i,'Titre',m.t||'','text')+field('pm_d_'+i,'Description',m.d||'','textarea')+'</div>';
  });
  html+='</div><button class="btn-add" onclick="addPrepaTDItem(\'prepa-modele-list\',\'pm\')">+ Point</button>';
  html+=metaBoxClose();

  // Pedagogie
  var ped=d.pedagogie||[];
  html+=metaBoxOpen('Pedagogie ('+ped.length+')',false);
  html+='<div id="prepa-ped-list">';
  ped.forEach(function(p,i){
    html+='<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>'+
      field('pp_t_'+i,'Titre',p.t||'','text')+field('pp_d_'+i,'Description',p.d||'','textarea')+'</div>';
  });
  html+='</div><button class="btn-add" onclick="addPrepaTDItem(\'prepa-ped-list\',\'pp\')">+ Point</button>';
  html+=metaBoxClose();

  html+='</div>'; // end content

  // Sidebar
  html+='<div class="admin-editor-sidebar">';
  html+='<div class="admin-publish-box"><div class="admin-publish-box-header">Publication</div><div class="admin-publish-box-body">';
  html+='<div class="pub-info">Publiee : <label class="toggle-switch"><input type="checkbox" id="toggle-p-published" '+(d.published!==false?'checked':'')+' onchange="markUnsaved()"><span class="toggle-slider"></span></label></div>';
  html+='<div class="pub-info">Featured : <label class="toggle-switch"><input type="checkbox" id="toggle-p-featured" '+(d.featured?'checked':'')+' onchange="markUnsaved()"><span class="toggle-slider"></span></label></div>';
  html+='<div class="pub-info">Coup de coeur : <label class="toggle-switch"><input type="checkbox" id="toggle-p-coeur" '+(d.coup_de_coeur?'checked':'')+' onchange="markUnsaved()"><span class="toggle-slider"></span></label></div>';
  html+='</div><div class="admin-publish-box-footer"><button class="btn-primary" onclick="savePrepa()" id="btn-save-prepa">Sauvegarder</button></div></div>';
  html+='</div></div></div>';
  main.innerHTML=html;main.scrollTop=0;
}

/* Prepa dynamic helpers */
window.addPrepaDynItem=function(listId,prefix){
  var l=document.getElementById(listId);if(!l)return;var i=l.children.length;
  l.insertAdjacentHTML('beforeend','<div class="dyn-item"><input type="text" name="'+prefix+'_val_'+i+'" oninput="markUnsaved()" placeholder="Valeur" style="max-width:100px"><input type="text" name="'+prefix+'_lbl_'+i+'" oninput="markUnsaved()" placeholder="Label"><button class="dyn-item-rm" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button></div>');
  markUnsaved();
};
window.addPrepaTDItem=function(listId,prefix){
  var l=document.getElementById(listId);if(!l)return;var i=l.children.length;
  l.insertAdjacentHTML('beforeend','<div class="faq-block-item"><button class="admin-faq-remove" onclick="this.parentElement.remove();markUnsaved()">&#10005;</button>'+
    field(prefix+'_t_'+i,'Titre','','text')+field(prefix+'_d_'+i,'Description','','textarea')+'</div>');
  markUnsaved();
};

function collectPrepaData(){
  var d={};
  d.name=getVal('p_name');d.slug=getVal('p_slug');d.ville=getVal('p_ville');
  d.villes=getVal('p_villes').split(',').map(function(v){return v.trim()}).filter(Boolean);
  d.taux=getVal('p_taux');d.anciennete=getVal('p_anciennete');d.etudiants=getVal('p_etudiants');
  d.format=getVal('p_format');d.intro=getVal('p_intro');d.avis=getVal('p_avis');
  d.filieres=[];document.querySelectorAll('.p_filiere:checked').forEach(function(cb){d.filieres.push(cb.value)});
  d.tags=getVal('p_tags').split(',').map(function(t){return t.trim()}).filter(Boolean);
  d.stats=[];document.querySelectorAll('#prepa-stats-list .dyn-item').forEach(function(el){
    var inputs=el.querySelectorAll('input');if(inputs.length>=2)d.stats.push({val:inputs[0].value.trim(),lbl:inputs[1].value.trim()});
  });
  d.modele=[];document.querySelectorAll('#prepa-modele-list .faq-block-item').forEach(function(el,i){
    var t=getElVal(el,'[name^="pm_t_"]');var dd=getElVal(el,'[name^="pm_d_"]');d.modele.push({t:t,d:dd});
  });
  d.pedagogie=[];document.querySelectorAll('#prepa-ped-list .faq-block-item').forEach(function(el){
    var t=getElVal(el,'[name^="pp_t_"]');var dd=getElVal(el,'[name^="pp_d_"]');d.pedagogie.push({t:t,d:dd});
  });
  d.published=document.getElementById('toggle-p-published').checked;
  d.featured=document.getElementById('toggle-p-featured').checked;
  d.coup_de_coeur=document.getElementById('toggle-p-coeur').checked;
  return d;
}

window.savePrepa=async function(){
  var btn=document.getElementById('btn-save-prepa');btn.disabled=true;btn.textContent='Sauvegarde...';
  try{var d=collectPrepaData();d.updated_at=new Date().toISOString();var r=await sb.from(TABLE_PREPAS).update(d).eq('id',state.currentId);if(r.error)throw r.error;state.unsaved=false;await loadPrepas();showToast('Prepa sauvegardee','success')}
  catch(err){showToast('Erreur : '+(err.message||'Echec'),'error')}
  btn.disabled=false;btn.textContent='Sauvegarder';
};

window.deletePrepa=async function(id){
  if(!confirm('Supprimer cette prepa ?'))return;
  try{var r=await sb.from(TABLE_PREPAS).delete().eq('id',id);if(r.error)throw r.error;await loadPrepas();showToast('Supprimee','success');navigate('prepas')}catch(err){showToast('Erreur','error')}
};

window.showAddPrepaModal=function(){
  var html='<div class="admin-modal-overlay" id="add-prepa-modal" onclick="if(event.target===this)this.remove()">';
  html+='<div class="admin-modal"><h3>Nouvelle prepa</h3>';
  html+=field('new_prepa_name','Nom','','text');
  html+=field('new_prepa_ville','Ville','','text');
  html+='<div class="admin-field"><label>Format</label><select id="new-prepa-format"><option>Présentiel</option><option>En ligne</option><option>Hybride</option></select></div>';
  html+='<div class="admin-modal-actions"><button class="btn-secondary" onclick="document.getElementById(\'add-prepa-modal\').remove()">Annuler</button>';
  html+='<button class="btn-primary" onclick="createPrepa()">Creer</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
};

window.createPrepa=async function(){
  var name=getVal('new_prepa_name');if(!name){showToast('Nom requis','error');return}
  var ville=getVal('new_prepa_ville');var format=document.getElementById('new-prepa-format').value;
  try{
    var r=await sb.from(TABLE_PREPAS).insert({slug:slugify(name),name:name,ville:ville,villes:ville?[ville]:[],format:format,published:true}).select().single();
    if(r.error)throw r.error;
    document.getElementById('add-prepa-modal').remove();await loadPrepas();showToast('Prepa creee','success');editPrepa(r.data.id);
  }catch(err){showToast('Erreur','error')}
};

/* ========== PAGE EDITOR ========== */
function renderPageList(){
  var main=document.getElementById('admin-main');
  var html='<div class="admin-page-list"><div class="admin-page-list-header"><h2>Pages</h2><span class="list-count">'+pagesCache.length+' pages</span></div>';
  html+='<div class="filter-bar"><input type="text" id="page-search" placeholder="Rechercher..." oninput="filterPages()"></div>';
  html+='<div class="table-scroll"><table class="admin-table"><thead><tr><th>Slug</th><th>Titre</th><th>Type</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead><tbody id="page-tbody">';
  pagesCache.forEach(function(p){
    html+='<tr data-slug="'+escAttr(p.page_slug)+'">';
    html+='<td class="page-title-cell" onclick="editPage(\''+escAttr(p.page_slug)+'\')">'+esc(p.page_slug)+'</td>';
    html+='<td>'+esc(p.title||'--')+'</td>';
    html+='<td>'+esc(p.page_type||'--')+'</td>';
    html+='<td>'+(p.published?'<span class="status-dot published"></span>Publie':'<span class="status-dot draft"></span>Brouillon')+'</td>';
    html+='<td>'+formatDate(p.updated_at)+'</td>';
    html+='<td class="row-actions"><a href="javascript:void(0)" onclick="editPage(\''+escAttr(p.page_slug)+'\')">Modifier</a></td></tr>';
  });
  html+='</tbody></table></div></div>';main.innerHTML=html;
}

window.filterPages=function(){
  var s=normalize(document.getElementById('page-search').value);
  document.querySelectorAll('#page-tbody tr').forEach(function(tr){tr.style.display=!s||normalize(tr.dataset.slug).indexOf(s)>=0?'':'none'});
};

async function loadPageData(slug){
  var main=document.getElementById('admin-main');
  main.innerHTML='<div style="padding:60px;text-align:center;color:#787c82">Chargement...</div>';
  var r=await sb.from(TABLE_PAGES).select('*').eq('page_slug',slug).maybeSingle();
  state.pageData=r.data;renderPageEditor();
}

function renderPageEditor(){
  var d=state.pageData||{};
  var main=document.getElementById('admin-main');
  var html='<div class="admin-editor">';
  html+='<div class="admin-editor-breadcrumb"><a href="javascript:void(0)" onclick="navigate(\'dashboard\')">Tableau de bord</a> &rsaquo; <a href="javascript:void(0)" onclick="navigate(\'pages\')">Pages</a> &rsaquo; '+esc(d.page_slug||'')+'</div>';
  html+='<div class="admin-editor-header"><h2>'+esc(d.title||d.page_slug||'Page')+'</h2>';
  html+='<button class="btn-back" onclick="navigate(\'pages\')">&larr; Retour</button></div>';
  html+='<div class="admin-editor-layout"><div class="admin-editor-content">';

  html+=metaBoxOpen('Informations',false);
  html+=field('pg_title','Titre',d.title||'','text');
  html+=field('pg_meta_desc','Meta description',d.meta_description||'','textarea');
  html+=field('pg_subtitle','Sous-titre',d.subtitle||'','text');
  html+=metaBoxClose();

  // Blocks
  var sections=d.sections||[];
  html+=metaBoxOpen('Contenu ('+sections.length+' blocs)',false);
  html+='<div id="pg-list">';
  sections.forEach(function(block,i){html+=renderBlockItem(block,i,'pg')});
  html+='</div>';
  html+='<div class="add-block-menu">';
  BLOCK_TYPES.forEach(function(bt){html+='<button class="add-block-btn" onclick="addBlockToList(\''+bt.type+'\',\'pg\')">'+bt.badge+' '+bt.label+'</button>'});
  html+='</div>';
  html+=metaBoxClose();

  html+='</div>';

  // Sidebar
  html+='<div class="admin-editor-sidebar">';
  html+='<div class="admin-publish-box"><div class="admin-publish-box-header">Publication</div><div class="admin-publish-box-body">';
  html+='<div class="pub-info">Publiee : <label class="toggle-switch"><input type="checkbox" id="toggle-pg-pub" '+(d.published?'checked':'')+' onchange="markUnsaved()"><span class="toggle-slider"></span></label></div>';
  html+='</div><div class="admin-publish-box-footer"><button class="btn-primary" onclick="savePage()" id="btn-save-page">Sauvegarder</button></div></div>';
  html+='</div></div></div>';
  main.innerHTML=html;main.scrollTop=0;
}

window.savePage=async function(){
  var btn=document.getElementById('btn-save-page');btn.disabled=true;btn.textContent='Sauvegarde...';
  try{
    var data={title:getVal('pg_title'),meta_description:getVal('pg_meta_desc'),subtitle:getVal('pg_subtitle'),sections:collectBlocks('pg'),published:document.getElementById('toggle-pg-pub').checked,updated_at:new Date().toISOString()};
    var r=await sb.from(TABLE_PAGES).update(data).eq('page_slug',state.currentId);
    if(r.error)throw r.error;state.unsaved=false;await loadPages();showToast('Page sauvegardee','success');
  }catch(err){showToast('Erreur : '+(err.message||'Echec'),'error')}
  btn.disabled=false;btn.textContent='Sauvegarder';
};

/* ========== START ========== */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
