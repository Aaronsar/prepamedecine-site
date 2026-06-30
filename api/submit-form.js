const CRM_URL_DEFAULT='https://hub.diploma-sante.fr/api/webhooks/afem-form';
const PREPA_CHOIX=['medisup','diploma','antemed','cpcm','autre'];
const PREPA_RAISON=['financier','pas_le_temps','pas_utile','autre'];
function cors(o){return{'Access-Control-Allow-Origin':o||'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin'};}
function okOrigin(o){return !o||/^https?:\/\/(localhost(:\d+)?|(.*\.)?prepamedecine\.fr|.*\.vercel\.app)$/.test(o);}
function isEmail(v){return typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<200;}
function str(v,m){if(v==null)return null;const s=String(v).trim();return s?s.slice(0,m||200):null;}
export default async function handler(req,res){
  const o=req.headers.origin,c=cors(okOrigin(o)?o:'');
  if(req.method==='OPTIONS'){Object.entries(c).forEach(([k,v])=>res.setHeader(k,v));res.status(204).end();return;}
  Object.entries(c).forEach(([k,v])=>res.setHeader(k,v));res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
  if(!okOrigin(o)){res.status(403).json({error:'Origin not allowed'});return;}
  const TOKEN=process.env.AFEM_WEBHOOK_TOKEN,URL=process.env.CRM_WEBHOOK_URL||CRM_URL_DEFAULT;
  if(!TOKEN){res.status(500).json({error:'Server misconfigured'});return;}
  let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b);}catch{res.status(400).json({error:'Invalid JSON body'});return;}}
  if(!b||typeof b!=='object'){res.status(400).json({error:'Missing body'});return;}
  const email=str(b.email,200),phone=str(b.phone,40);
  if(!email&&!phone){res.status(400).json({error:'Email or phone required'});return;}
  if(email&&!isEmail(email)){res.status(400).json({error:'Email invalide'});return;}
  const commence=b.commence_pass_las==='oui'?'oui':(b.commence_pass_las==='non'?'non':null);
  if(!commence){res.status(400).json({error:'commence_pass_las requis'});return;}
  let pp=null,pc=null,pcl=null,pnr=null,pnrl=null;
  if(commence==='oui'){
    pp=b.prepa_prevue==='oui'?'oui':(b.prepa_prevue==='non'?'non':null);
    if(!pp){res.status(400).json({error:'prepa_prevue requis'});return;}
    if(pp==='oui'){pc=PREPA_CHOIX.includes(b.prepa_choix)?b.prepa_choix:null;if(!pc){res.status(400).json({error:'prepa_choix requis'});return;}if(pc==='autre')pcl=str(b.prepa_choix_libre,200);}
    else{pnr=PREPA_RAISON.includes(b.prepa_non_raison)?b.prepa_non_raison:null;if(!pnr){res.status(400).json({error:'prepa_non_raison requis'});return;}if(pnr==='autre')pnrl=str(b.prepa_non_raison_libre,300);}
  }
  const payload={firstname:str(b.firstname,80),lastname:str(b.lastname,80),email:email?email.toLowerCase():null,phone,
    departement:str(b.departement,12),classe_actuelle:str(b.classe_actuelle,40),
    source_url:'https://www.prepamedecine.fr/form',
    commence_pass_las:commence,prepa_prevue:pp,prepa_choix:pc,prepa_choix_libre:pcl,prepa_non_raison:pnr,prepa_non_raison_libre:pnrl,
    meta:{form_id:'requalification-prepa-prepamedecine',hubspot_contact_id:str(b.hubspot_contact_id,60),utm_campaign:str(b.utm_campaign,120)||'last-chance-medecine'}};
  try{
    const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
    const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch{}
    if(!r.ok){res.status(502).json({error:'CRM upstream',status:r.status});return;}
    res.status(200).json({ok:true,contact_id:j.contact_id||null,action:j.action||null});
  }catch(e){res.status(502).json({error:'CRM injoignable'});}
}
