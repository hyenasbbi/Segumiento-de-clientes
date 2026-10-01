// Custom authentication: private admin password and random seller capability keys; only hashes stored.
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-tracker-key','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const base=Deno.env.get('SUPABASE_URL')!+'/rest/v1/';
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path:string,method='GET',body?:unknown){const r=await fetch(base+path,{method,headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok){const t=await r.text();throw new Error(t.includes('CONFLICT_OR_NOT_FOUND')?'El cliente cambió. Actualizá antes de guardar.':'Error de base de datos');}return r.status===204?null:r.json();}
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const newKey=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f-]{36}$/i.test(s);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Método inválido'},405);
 try{
 const key=req.headers.get('x-tracker-key')||'';if(key.length<10||key.length>128)return reply({error:'Acceso inválido'},401);
 const keys=await db('ct_access?token_hash=eq.'+await hash(key)+'&select=role,seller_id');const access=keys[0];if(!access)return reply({error:'El enlace o la clave no es válido, o fue revocado.'},401);
 const raw=await req.text();if(raw.length>4000000)return reply({error:'Archivo demasiado grande'},413);const b=JSON.parse(raw);const admin=access.role==='admin';
 if(b.action==='load'){
 const sellers=await db('ct_sellers?select=id,name&order=name'+(admin?'':'&id=eq.'+access.seller_id));
 let clients:unknown[]=[];for(let offset=0;;offset+=1000){const page=await db('ct_clients?select=*&order=id&limit=1000&offset='+offset+(admin?'':'&seller_id=eq.'+access.seller_id));clients.push(...page);if(page.length<1000)break;}
 return reply({role:access.role,sellers,clients});}
 if(b.action==='mark'){
 if(!uuid(b.id)||!['activo','muerto','seguimiento'].includes(b.status)||typeof b.notes!=='string'||b.notes.length>4000||!Number.isInteger(b.version))return reply({error:'Marcación inválida'},400);
 return reply(await db('rpc/ct_mark','POST',{p_id:b.id,p_seller:admin?null:access.seller_id,p_status:b.status,p_notes:b.notes,p_version:b.version,p_actor:admin?'Administrador':access.seller_id}));}
 if(!admin)return reply({error:'Acción reservada al administrador'},403);
 if(b.action==='addSeller'){const name=String(b.name||'').trim();if(!name||name.length>100)return reply({error:'Nombre inválido'},400);return reply(await db('ct_sellers','POST',{name}));}
 if(b.action==='link'){
 if(!uuid(b.seller_id))return reply({error:'Vendedor inválido'},400);
 const token=newKey();
 // Delete + insert replaced by service-only transactional RPC below.
 await db('rpc/ct_rotate_link','POST',{p_seller:b.seller_id,p_hash:await hash(token)});return reply({token});}
 if(b.action==='import'){
 if(!uuid(b.seller_id)||!Array.isArray(b.rows)||b.rows.length<1||b.rows.length>5000)return reply({error:'Importá entre 1 y 5000 clientes'},400);
 const seen=new Set();for(const r of b.rows){if(!r.name||typeof r.name!=='string'||r.name.length>300||typeof r.identity!=='string'||r.identity.length>600||seen.has(r.identity)||typeof r.network!=='string'||typeof r.url!=='string'||r.url.length>1000||!Number.isFinite(r.paid)||r.paid<0||!Number.isFinite(r.pending)||r.pending<0||!Number.isInteger(r.sales)||r.sales<0) return reply({error:'Datos inválidos o clientes duplicados en el archivo'},400);seen.add(r.identity);}
 return reply({count:await db('rpc/ct_import','POST',{p_seller:b.seller_id,p_rows:b.rows,p_filename:String(b.filename||'Excel').slice(0,250)})});}
 return reply({error:'Acción desconocida'},400);
 }catch(e){return reply({error:e instanceof Error?e.message:'Error inesperado'},400);}
});
