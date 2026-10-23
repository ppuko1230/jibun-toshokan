import {folderBackup,prepareFolderImport} from './folder-backup';
import {challenges,validChallenge} from './web-learning';
import {validWebPreferences} from './app/lib/web-types';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,existsSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {books,database} from './app/lib/library';
import {listTerms} from './app/lib/terms-store';
import {termKey} from './app/lib/term-types';
import {sqlite,dataRoot,snapshot} from './local-store';
import {validReaderView} from './app/lib/reader-view';
import {studyState} from './study-state';
import {validReaderModeKeys} from './app/lib/reader-mode-keys';
import {validGuideSeen} from './app/lib/usage-guide';
import {validBookCompletion} from './app/lib/book-completion';
import {practiceState,validPracticeState,importPractice} from './code-practice';
import {clozeState,importCloze} from './cloze-practice';
import {validClozeState,type ClozeState} from './app/lib/cloze-types';
const owner='local-pc';
const invalid=(message:string)=>{throw new Error(message);};
const text=(v:any,max:number)=>typeof v==='string'&&v.length<=max;
const stamp=(v:any)=>typeof v==='string'&&!Number.isNaN(Date.parse(v));
export async function fullBackup(){
  const library=await books(owner,true);
  const items=library.map(b=>b.sample?b:{...b,pages:sqlite.prepare('SELECT page,label,content FROM pages WHERE book_id=? ORDER BY page').all(b.id),pdf:readFileSync(join(dataRoot,'pdfs',owner,b.id+'.pdf')).toString('base64')});
  const cloze=clozeState(),folderLibrary=await folderBackup(),state=studyState();
  // Older updaters compare the full backup. Empty additive features are omitted
  // so their introduction preserves that comparison and all existing data.
  return {format:state.bookCompletion?'yohaku-local-v3':folderLibrary?'yohaku-local-v2':'yohaku-local-v1',...(folderLibrary?{folderLibrary}:{}),exportedAt:new Date().toISOString(),books:items,bookTrash:sqlite.prepare('SELECT book_id AS bookId,deleted_at AS deletedAt FROM book_trash WHERE owner=?').all(owner),notes:sqlite.prepare('SELECT book_id,page,body,updated_at FROM notes WHERE owner=?').all(owner),terms:await listTerms(owner),challenges:challenges(),studyState:state,codePractice:practiceState(),...(cloze.questions.length?{clozePractice:cloze}:{})};
}
export async function importBackup(data:any){
  if(!data||!['yohaku-local-v3','yohaku-notes-v3','yohaku-local-v2','yohaku-notes-v2','yohaku-notes-v1','yohaku-local-v1'].includes(data.format)||!Array.isArray(data.books)||!Array.isArray(data.notes)||!Array.isArray(data.terms??[])||data.books.length>1000||data.notes.length>20000||(data.terms?.length||0)>10000)invalid('余白のバックアップJSONを選んでください。');
  const scoped=data.format==='yohaku-local-v3'?!!data.folderLibrary:['yohaku-local-v2','yohaku-notes-v3'].includes(data.format);
  if(scoped!==!!data.folderLibrary||(data.terms||[]).some((t:any)=>t.scopeFolderId!=null))invalid('共有範囲付きバックアップの形式を確認してください。');
  const library=await books(owner,true),map=new Map<string,{id:string,pageCount:number}>(),newBooks:any[]=[],ids=new Set<string>();
  for(const b of data.books){
    if(!text(b.id,200)||!b.id||ids.has(b.id)||!text(b.title,120)||!Number.isInteger(b.pageCount)||b.pageCount<1||b.pageCount>1000||!text(b.hash,64))invalid('教材情報が正しくありません。');
    ids.add(b.id);
    const existing=library.find(x=>x.hash===b.hash&&(x.sample?x.id===b.id:true))||newBooks.find(x=>x.hash===b.hash);
    if(existing){map.set(b.id,existing);continue;}
    if(!['yohaku-local-v1','yohaku-local-v2','yohaku-local-v3'].includes(data.format)||b.sample||typeof b.pdf!=='string')continue;
    if(b.pdf.length>28*1024*1024||!Array.isArray(b.pages)||b.pages.length!==b.pageCount||b.pages.some((p:any,i:number)=>p.page!==i+1||!text(p.label,80)||!text(p.content,100000))||JSON.stringify(b.pages).length>5*1024*1024)invalid('教材のページ情報が正しくありません。');
    const bytes=Buffer.from(b.pdf,'base64');
    if(bytes.length>20*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==b.hash)invalid('PDFが破損しているか、大きすぎます。');
    const added={...b,id:randomUUID(),bytes:bytes.length,pdf:bytes};newBooks.push(added);map.set(b.id,added);
  }
  // Old note-only backups sometimes omit books that have no notes; all referenced
  // books must resolve before any data/file mutation happens.
  const missing=new Set<string>();
  function reference(id:any,page:any){
    if(typeof id!=='string'||!Number.isInteger(page)||page<1)invalid('メモのページ情報が正しくありません。');
    const b=map.get(id);if(!b){missing.add(data.books.find((x:any)=>x.id===id)?.title||id);return null;}
    if(page>b.pageCount)invalid('メモのページ番号が教材の範囲外です。');return b.id;
  }
  const notes=data.notes.map((n:any)=>{if(!text(n.body,10000)||!stamp(n.updated_at))invalid('補足の内容が正しくありません。');return {...n,book_id:reference(n.book_id,n.page)};});
  const terms=(data.terms||[]).map((t:any)=>{
    if(!text(t.term,120)||!termKey(t.term)||!text(t.body,10000)||!t.body.trim()||!Array.isArray(t.aliases)||t.aliases.length>20||t.aliases.some((a:any)=>!text(a,120)||!termKey(a))||!stamp(t.updatedAt))invalid('用語メモの内容が正しくありません。');
    return {...t,sourceBookId:t.sourceBookId==null?null:reference(t.sourceBookId,t.sourcePage),sourcePage:t.sourceBookId==null?null:t.sourcePage};
  });
  if(!Array.isArray(data.challenges??[])||(data.challenges?.length||0)>20000)invalid('課題の情報が正しくありません。');
  const learningChallenges=(data.challenges||[]).map((c:any)=>{if(!validChallenge(c))invalid('課題の内容が正しくありません。');return {...c,bookId:reference(c.bookId,c.page)};});
  let cloze:ClozeState|undefined;
  if(data.clozePractice!==undefined){if(!validClozeState(data.clozePractice)||JSON.stringify(data.clozePractice).length>40*1024*1024)invalid('虫食い練習の情報が正しくありません。');cloze={...data.clozePractice,questions:data.clozePractice.questions.map((q:any)=>({...q,bookId:reference(q.bookId,q.page)}))};}
  const state=data.studyState;
  if(data.format==='yohaku-local-v3'&&state?.bookCompletion===undefined)invalid('学習済みの情報が見つかりません。');
  if(state?.bookCompletion!==undefined&&!validBookCompletion(state.bookCompletion))invalid('学習済みの情報が正しくありません。');
  const completion=(state?.bookCompletion||[]).map((p:any)=>({...p,bookId:reference(p.bookId,1)}));
  if(data.codePractice!==undefined&&!validPracticeState(data.codePractice))invalid('コード練習の情報が正しくありません。');
  if(state?.webPreferences&&!validWebPreferences(state.webPreferences))invalid('本文の表示設定が正しくありません。');
  if(state?.readerModeKeys!==undefined&&!validReaderModeKeys(state.readerModeKeys))invalid('紙面の操作キーの設定が正しくありません。');
  if(state?.pageTurnSound!==undefined&&typeof state.pageTurnSound!=='boolean')invalid('ページをめくる音の設定が正しくありません。');
  if(state?.guideSeen!==undefined&&!validGuideSeen(state.guideSeen))invalid('使い方ガイドの情報が正しくありません。');
  if(state?.updateCheckOnStart!==undefined&&typeof state.updateCheckOnStart!=='boolean')invalid('起動時の更新確認の設定が正しくありません。');
  if(state&&(!['normal','large'].includes(state.fontSize)||!Array.isArray(state.reading)||!Array.isArray(state.bookmarks)||state.reading.length>1000||state.bookmarks.length>10000))invalid('しおり・表示設定の情報が正しくありません。');
  const reading=(state?.reading||[]).map((p:any)=>{if(!stamp(p.updatedAt))invalid('続きのページ情報が正しくありません。');return {...p,bookId:reference(p.bookId,p.page)};});
  if(state?.views&&(typeof state.views!=='object'||Array.isArray(state.views)||Object.keys(state.views).length>1000))invalid('読書位置の情報が正しくありません。');
  const views=Object.entries(state?.views||{}).map(([bookId,view]:[string,any])=>{if(!validReaderView(view)||view.capturedAt>Date.now()+60000)invalid('読書位置の情報が正しくありません。');return {bookId:reference(bookId,view.page),view};});
  const bookmarks=(state?.bookmarks||[]).map((p:any)=>{if(!stamp(p.createdAt))invalid('しおりの情報が正しくありません。');return {...p,bookId:reference(p.bookId,p.page)};});
  if(!Array.isArray(data.bookTrash??[])||(data.bookTrash?.length||0)>1000)invalid('ごみ箱の情報が正しくありません。');
  const trashIds=new Set<string>();
  const trash=(data.bookTrash||[]).map((t:any)=>{if(!t||!stamp(t.deletedAt)||typeof t.bookId!=='string'||trashIds.has(t.bookId))invalid('ごみ箱の情報が正しくありません。');trashIds.add(t.bookId);return {bookId:reference(t.bookId,1),deletedAt:t.deletedAt};});
  const importFolders=prepareFolderImport(data.folderLibrary,reference);
  if(missing.size)invalid('先に次のPDFを本棚に追加してから、もう一度取り込んでください：'+[...missing].join('、'));
  if(cloze)importCloze(cloze,true);
  snapshot(true);
  const written:string[]=[],report={books:newBooks.length,notes:0,terms:0,challenges:0,unchanged:0,conflicts:0};
  try{
    sqlite.exec('BEGIN IMMEDIATE');
    for(const b of newBooks){
      const dir=join(dataRoot,'pdfs',owner);mkdirSync(dir,{recursive:true});const target=join(dir,b.id+'.pdf');writeFileSync(target,b.pdf,{flag:'wx'});written.push(target);
      sqlite.prepare('INSERT INTO textbooks VALUES(?,?,?,?,?,?,?,?)').run(b.id,owner,b.title,String(b.filename||b.title+'.pdf').slice(0,200),b.hash,b.bytes,b.pageCount,new Date().toISOString());
      for(const p of b.pages)sqlite.prepare('INSERT INTO pages VALUES(?,?,?,?)').run(b.id,p.page,p.label,p.content);
    }
    const folderReport=importFolders();
    for(const n of notes){
      const old=sqlite.prepare('SELECT body FROM notes WHERE owner=? AND book_id=? AND page=?').get(owner,n.book_id,n.page) as any;
      if(old&&old.body===n.body){report.unchanged++;continue;}
      if(old?.body){report.conflicts++;continue;}
      sqlite.prepare('INSERT INTO notes VALUES(?,?,?,?,?) ON CONFLICT(owner,book_id,page) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(owner,n.book_id,n.page,n.body,n.updated_at);report.notes++;
    }
    for(const t of terms){
      const names=[...new Map([t.term,...t.aliases].map((name:string)=>[termKey(name),name])).entries()] as [string,string][];
      const existing=names.map(([key])=>sqlite.prepare('SELECT memo_id FROM term_names WHERE owner=? AND name_key=?').get(owner,key) as any).filter(Boolean);
      if(existing.length){
        const old=sqlite.prepare('SELECT term,body FROM term_memos WHERE id=?').get(existing[0].memo_id) as any;
        const oldNames=(sqlite.prepare('SELECT name_key FROM term_names WHERE memo_id=?').all(existing[0].memo_id) as any[]).map(x=>x.name_key).sort();
        if(old.term===t.term&&old.body===t.body&&existing.every(x=>x.memo_id===existing[0].memo_id)&&JSON.stringify(oldNames)===JSON.stringify(names.map(n=>n[0]).sort()))report.unchanged++;else report.conflicts++;
        continue;
      }
      const id=randomUUID();sqlite.prepare('INSERT INTO term_memos VALUES(?,?,?,?,?,?,?)').run(id,owner,t.term,t.body,t.sourceBookId,t.sourcePage,t.updatedAt);
      for(const [key,display] of names)sqlite.prepare('INSERT INTO term_names VALUES(?,?,?,?)').run(owner,key,display,id);report.terms++;
    }
    const existingChallenges=new Map(challenges().map(c=>[c.id,c]));
    for(const c of learningChallenges){
      const old=existingChallenges.get(c.id);
      if(old){if(old.bookId===c.bookId&&old.page===c.page&&old.blockId===c.blockId&&old.quote===c.quote&&old.kind===c.kind&&old.body===c.body&&old.status===c.status)report.unchanged++;else report.conflicts++;continue;}
      sqlite.prepare('INSERT INTO learning_challenges VALUES(?,?,?,?,?,?,?,?,?,?)').run(c.id,c.bookId,c.page,c.blockId,c.quote,c.kind,c.body,c.status,c.createdAt,c.updatedAt);existingChallenges.set(c.id,c);report.challenges++;
    }
    if(state?.webPreferences)sqlite.prepare("INSERT INTO preferences VALUES('webReading',?) ON CONFLICT(key) DO NOTHING").run(JSON.stringify(state.webPreferences));
    if(state?.readerModeKeys)sqlite.prepare("INSERT INTO preferences VALUES('readerModeKeys',?) ON CONFLICT(key) DO NOTHING").run(JSON.stringify(state.readerModeKeys));
    if(state?.pageTurnSound!==undefined)sqlite.prepare("INSERT INTO preferences VALUES('pageTurnSound',?) ON CONFLICT(key) DO NOTHING").run(JSON.stringify(state.pageTurnSound));
    if(state?.updateCheckOnStart!==undefined)sqlite.prepare("INSERT INTO preferences VALUES('updateCheckOnStart',?) ON CONFLICT(key) DO NOTHING").run(JSON.stringify(state.updateCheckOnStart));
    for(const kind of ['library','reader'] as const)if(state?.guideSeen?.[kind])sqlite.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO NOTHING').run('guideSeen.'+kind,'true');
    const completionByBook=new Map<string,typeof completion[number]>();
    for(const p of completion){const old=completionByBook.get(p.bookId);if(!old||Date.parse(p.updatedAt)>Date.parse(old.updatedAt))completionByBook.set(p.bookId,p);}
    // Preserve any explicit local choice, including an unchecked completion.
    for(const p of completionByBook.values())sqlite.prepare('INSERT INTO book_completion VALUES(?,?,?) ON CONFLICT(book_id) DO NOTHING').run(p.bookId,p.completed?1:0,p.updatedAt);
    for(const p of reading)sqlite.prepare('INSERT INTO reading_positions VALUES(?,?,?) ON CONFLICT(book_id) DO NOTHING').run(p.bookId,p.page,p.updatedAt);
    for(const p of views){
      const current=sqlite.prepare('SELECT page FROM reading_positions WHERE book_id=?').get(p.bookId) as any;
      if(current?.page===p.view.page)sqlite.prepare('INSERT INTO reader_views VALUES(?,?,?) ON CONFLICT(book_id) DO NOTHING').run(p.bookId,JSON.stringify(p.view),p.view.capturedAt);
    }
    for(const p of bookmarks)sqlite.prepare('INSERT INTO bookmarks VALUES(?,?,?) ON CONFLICT(book_id,page) DO NOTHING').run(p.bookId,p.page,p.createdAt);
    if(state)sqlite.prepare("INSERT INTO preferences VALUES('fontSize',?) ON CONFLICT(key) DO NOTHING").run(state.fontSize);
    if(data.codePractice!==undefined)importPractice(data.codePractice);
    const clozeReport=cloze?importCloze(cloze):null;
    for(const t of trash)sqlite.prepare('INSERT INTO book_trash VALUES(?,?,?) ON CONFLICT(owner,book_id) DO NOTHING').run(owner,t.bookId,t.deletedAt);
    sqlite.exec('COMMIT');return {...report,...folderReport,bookmarks:bookmarks.length,...(clozeReport?{cloze:clozeReport}: {})};
  }catch(e){try{sqlite.exec('ROLLBACK');}catch{}for(const target of written)if(existsSync(target))unlinkSync(target);throw e;}
}
