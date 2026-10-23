import {folders,folderRoute,termContext,FolderError} from '../../lib/folders-store';
import {folderBackup} from '../../../folder-backup';
import { getChatGPTUser } from '../../chatgpt-auth';
import { database,bucket,books,findBook,pageData,sampleBooks } from '../../lib/library';
import { queryGroups,matches,excerpt } from '../../lib/search';
import { listTerms,termRoute } from '../../lib/terms-store';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function GET(req:Request){return handle(req);}
export async function POST(req:Request){return handle(req);}
export async function PUT(req:Request){return handle(req);}
export async function DELETE(req:Request){return handle(req);}
async function handle(req:Request):Promise<Response>{
  try {
    const user=await getChatGPTUser();
    if(!user)return json({error:'ログインしてください。'},401);
    const owner=user.userId, url=new URL(req.url), p=url.pathname.slice(5).split('/');
    const db=database();
    if(req.method!=='GET'){
      const origin=req.headers.get('origin');
      if(origin && origin!==url.origin)return json({error:'この操作は許可されていません。'},403);
    }
    if(p[0]==='library' && req.method==='GET'){
      const all=await books(owner,true),active=await books(owner);
      return json({folders:folders(owner),books:active,trashedBooks:all.filter(b=>!active.some(a=>a.id===b.id))});
    }
    if(p[0]==='folders')return await folderRoute(req,owner,p);
    if(p[0]==='terms')return await termRoute(req,owner,p);
    if(p[0]==='search' && req.method==='GET'){
      const q=(url.searchParams.get('q')||'').slice(0,200), filter=url.searchParams.get('book'), source=url.searchParams.get('source')||'all';
      const groups=queryGroups(q); if(!groups.length)return json({results:[],total:0,aliases:[]});
      const scopeFolder=await termContext(owner,url),folderFilter=url.searchParams.get('folder');
      const library=(await books(owner)).filter(b=>(!filter||b.id===filter)&&(!folderFilter||(folderFilter==='unclassified'?!b.folderId:b.folderId===folderFilter)));
      const saved=(await db.prepare('SELECT book_id,page,body,updated_at FROM notes WHERE owner=?').bind(owner).all<any>()).results;
      const lookup=new Map(saved.map(n=>[n.book_id+':'+n.page,n]));
      const results:any[]=[];
      for(const b of library){
        const pages=b.sample?sampleBooks.find(s=>s.id===b.id)!.pages:(await db.prepare('SELECT page,label,content FROM pages WHERE book_id=? ORDER BY page').bind(b.id).all<any>()).results;
        for(const page of pages){
          const note=lookup.get(b.id+':'+page.page), textMatch=matches(page.content,groups),noteMatch=!!note&&matches(note.body,groups);
          if(source!=='terms'&&(source==='text'?textMatch:source==='notes'?noteMatch:textMatch||noteMatch)){
            results.push({bookId:b.id,title:b.title,page:page.page,label:page.label,excerpt:excerpt(page.content,groups),note:note?excerpt(note.body,groups):'',matchType:noteMatch&&textMatch?'both':noteMatch?'note':'text',score:(noteMatch?20:0)+(page.content.slice(0,120).toLowerCase().includes(q.toLowerCase())?5:0)});
          }
        }
      }
      results.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)||a.page-b.page);
      const terms=(source==='all'||source==='terms')?(await listTerms(owner,scopeFolder)).filter(t=>matches([t.term,...t.aliases,t.body].join(' '),groups)):[];
      return json({results:results.slice(0,100),terms,total:results.length+terms.length,pageTotal:results.length,aliases:groups.flat().filter(t=>!q.toLowerCase().includes(t))});
    }
    if(p[0]==='notes'&&req.method==='GET'){
      const library=await books(owner);
      const rows=(await db.prepare("SELECT book_id,page,body,updated_at FROM notes WHERE owner=? AND body<>'' ORDER BY updated_at DESC").bind(owner).all<any>()).results;
      return json({notes:rows.filter(n=>library.some(b=>b.id===n.book_id)).map(n=>({...n,title:library.find(b=>b.id===n.book_id)!.title,label:library.find(b=>b.id===n.book_id)!.labels[n.page-1]}))});
    }
    if(p[0]==='export'&&req.method==='GET'){
      const library=await books(owner,true),saved=(await db.prepare('SELECT book_id,page,body,updated_at FROM notes WHERE owner=?').bind(owner).all()).results;
      const folderLibrary=await folderBackup();
      return new Response(JSON.stringify({format:folderLibrary?'yohaku-notes-v3':'yohaku-notes-v2',...(folderLibrary?{folderLibrary}:{}),exportedAt:new Date().toISOString(),books:library,notes:saved,terms:await listTerms(owner)},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="yohaku-notes.json"','Cache-Control':'private, no-store'}});
    }
    if(p[0]==='upload' && req.method==='POST'){
      const len=Number(req.headers.get('content-length')||0);if(len>28*1024*1024)return json({error:'ファイルが大きすぎます（PDFは20MBまで）。'},413);
      const form=await req.formData(),file=form.get('file'),title=String(form.get('title')||'').trim().slice(0,120);
      if(!(file instanceof File)||file.size===0||file.size>20*1024*1024||!title)return json({error:'タイトルと20MB以内のPDFを指定してください。'},400);
      const data=await file.arrayBuffer();
      if(new TextDecoder().decode(data.slice(0,5))!=='%PDF-')return json({error:'PDF形式を確認できませんでした。'},400);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
      const library=await books(owner,true),duplicate=library.find(b=>b.hash===hash);
      if(duplicate){await db.prepare('DELETE FROM book_trash WHERE owner=? AND book_id=?').bind(owner,duplicate.id).run();return json({duplicate:true,book:duplicate});}
      let pages:any;try{pages=JSON.parse(String(form.get('pages')||''));}catch{return json({error:'ページ情報を読み取れません。'},400);}
      if(!Array.isArray(pages)||!pages.length||pages.length>1000||JSON.stringify(pages).length>5*1024*1024||pages.some(p=>typeof p.content!=='string'||p.content.length>100000||typeof p.label!=='string'||p.label.length>80))return json({error:'ページ情報が上限を超えています（1,000ページ・抽出文字5MBまで）。'},400);
      if(!pages.some(p=>p.content.trim()))return json({error:'文字を抽出できませんでした。スキャン画像のPDFは文字認識（OCR）後に追加してください。'},422);
      const id=crypto.randomUUID(),key=owner+'/'+id+'.pdf';
      await bucket().put(key,data,{httpMetadata:{contentType:'application/pdf'}});
      try{
        await db.batch([db.prepare('INSERT INTO textbooks (id,owner,title,filename,hash,bytes,page_count,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,owner,title,file.name.slice(0,200),hash,file.size,pages.length,new Date().toISOString()),...pages.map((p,i)=>db.prepare('INSERT INTO pages (book_id,page,label,content) VALUES (?,?,?,?)').bind(id,i+1,p.label,p.content))]);
      }catch(e){await bucket().delete(key); const existing=(await books(owner)).find(b=>b.hash===hash);if(existing)return json({duplicate:true,book:existing});throw e;}
      return json({book:await findBook(owner,id)},201);
    }
    if(p[0]==='books'&&p[1]){
      const b=await findBook(owner,p[1]);if(!b)return json({error:'教材が見つかりません。'},404);
      if(p.length===3&&['trash','restore'].includes(p[2])&&req.method==='POST'){
        if(p[2]==='trash')await db.prepare('INSERT INTO book_trash VALUES(?,?,?) ON CONFLICT(owner,book_id) DO NOTHING').bind(owner,b.id,new Date().toISOString()).run();
        else await db.prepare('DELETE FROM book_trash WHERE owner=? AND book_id=?').bind(owner,b.id).run();
        return json({saved:true});
      }
      if(p[2]==='pdf'&&req.method==='GET'){
        if(b.sample)return Response.redirect(new URL('/samples/'+b.id+'.pdf',req.url),302);
        const object=await bucket().get(owner+'/'+b.id+'.pdf');if(!object)return json({error:'PDFが見つかりません。'},404);
        return new Response(object.body,{headers:{'Content-Type':'application/pdf','Content-Length':String(object.size),'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(b.filename)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }
      const page=Number(p[3]);
      if(!Number.isInteger(page)||page<1||page>b.pageCount)return json({error:'ページ番号が範囲外です。'},400);
      if(p[2]==='pages'&&req.method==='GET'){
        const data=await pageData(b,page),note=await db.prepare('SELECT body,updated_at FROM notes WHERE owner=? AND book_id=? AND page=?').bind(owner,b.id,page).first();
        return json({...data,note:note||{body:'',updated_at:null}});
      }
      if(p[2]==='notes'&&req.method==='PUT'){
        if(Number(req.headers.get('content-length')||0)>60000)return json({error:'補足が長すぎます。'},413);
        const {body}=await req.json() as any;
        if(typeof body!=='string'||body.length>10000)return json({error:'補足は10,000文字以内で入力してください。'},400);
        const updatedAt=new Date().toISOString();
        await db.prepare('INSERT INTO notes (owner,book_id,page,body,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(owner,book_id,page) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').bind(owner,b.id,page,body,updatedAt).run();
        return json({saved:true,updatedAt});
      }
      if(p.length===4&&p[2]==='notes'&&req.method==='DELETE'){
        const note=await db.prepare('SELECT updated_at FROM notes WHERE owner=? AND book_id=? AND page=?').bind(owner,b.id,page).first<any>();
        if(!note)return json({error:'補足が見つかりません。一覧を更新してください。'},404);
        if(req.headers.get('if-match')!==JSON.stringify(note.updated_at))return json({error:'補足が更新されています。最新の内容を確認してから削除してください。'},409);
        const result=await db.prepare('DELETE FROM notes WHERE owner=? AND book_id=? AND page=? AND updated_at=?').bind(owner,b.id,page,note.updated_at).run();
        if(!result.changes)return json({error:'補足が更新されています。最新の内容を確認してから削除してください。'},409);
        return json({deleted:true});
      }
    }
    return json({error:'見つかりません。'},404);
  }catch(e){if(e instanceof FolderError)return json({error:e.message},e.status);console.error('Library operation failed',e instanceof Error?e.message:'unknown');return json({error:'保存先との通信に失敗しました。時間をおいてもう一度お試しください。'},500);}
}
