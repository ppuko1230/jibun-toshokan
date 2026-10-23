import {defaultWebPreferences,validWebPreferences} from './app/lib/web-types';
import {validReaderView} from './app/lib/reader-view';
import {sqlite} from './local-store';
import {findBook} from './app/lib/library';
import {defaultReaderModeKeys,validReaderModeKeys} from './app/lib/reader-mode-keys';
import type {GuideSeen} from './app/lib/usage-guide';
export function studyState(){
  const completion=(sqlite.prepare('SELECT book_id AS bookId,completed,updated_at AS updatedAt FROM book_completion ORDER BY book_id').all() as {bookId:string;completed:number;updatedAt:string}[]).map(row=>({...row,completed:!!row.completed}));
  const font=sqlite.prepare("SELECT value FROM preferences WHERE key='fontSize'").get() as any;
  const views=Object.fromEntries((sqlite.prepare('SELECT book_id,state FROM reader_views').all() as {book_id:string;state:string}[]).map(row=>[row.book_id,JSON.parse(row.state)]));
  const web=sqlite.prepare("SELECT value FROM preferences WHERE key='webReading'").get() as any;
  const webPreferences=web?JSON.parse(web.value):defaultWebPreferences;
  const modeKeys=sqlite.prepare("SELECT value FROM preferences WHERE key='readerModeKeys'").get() as any;
  const sound=sqlite.prepare("SELECT value FROM preferences WHERE key='pageTurnSound'").get() as any;
  const updateCheck=sqlite.prepare("SELECT value FROM preferences WHERE key='updateCheckOnStart'").get() as any;
  const guideSeen:GuideSeen={};
  for(const kind of ['library','reader'] as const)if(sqlite.prepare('SELECT value FROM preferences WHERE key=?').get('guideSeen.'+kind))guideSeen[kind]=true;
  return {views,webPreferences,...(completion.length?{bookCompletion:completion}:{}),...(updateCheck?{updateCheckOnStart:updateCheck.value!=='false'}:{}),...(Object.keys(guideSeen).length?{guideSeen}:{}),...(modeKeys?{readerModeKeys:JSON.parse(modeKeys.value)}:{}),...(sound?{pageTurnSound:sound.value!=='false'}:{}),fontSize:font?.value==='large'?'large':'normal',reading:sqlite.prepare('SELECT book_id AS bookId,page,updated_at AS updatedAt FROM reading_positions ORDER BY updated_at DESC').all(),bookmarks:sqlite.prepare('SELECT book_id AS bookId,page,created_at AS createdAt FROM bookmarks ORDER BY created_at DESC').all()};
}
export async function updateStudyState(data:any){
  if(!data||typeof data!=='object')throw new Error('設定を確認してください。');
  if(data.action==='book-completion'){
    if(typeof data.bookId!=='string'||typeof data.completed!=='boolean'||!await findBook('local-pc',data.bookId))throw new Error('教材と学習済みの状態を確認してください。');
    sqlite.prepare('INSERT INTO book_completion VALUES(?,?,?) ON CONFLICT(book_id) DO UPDATE SET completed=excluded.completed,updated_at=excluded.updated_at WHERE book_completion.completed<>excluded.completed').run(data.bookId,data.completed?1:0,new Date().toISOString());
  }else if(data.action==='startup-update-check'){
    if(typeof data.enabled!=='boolean')throw new Error('起動時の更新確認の設定を確認してください。');
    sqlite.prepare("INSERT INTO preferences VALUES('updateCheckOnStart',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(data.enabled));
  }else if(data.action==='guide-seen'){
    if(data.guide!=='library'&&data.guide!=='reader')throw new Error('使い方ガイドの種類を確認してください。');
    sqlite.prepare('INSERT INTO preferences VALUES(?,?) ON CONFLICT(key) DO NOTHING').run('guideSeen.'+data.guide,'true');
  }else if(data.action==='page-turn-sound'){
    if(typeof data.enabled!=='boolean')throw new Error('ページをめくる音の設定を確認してください。');
    sqlite.prepare("INSERT INTO preferences VALUES('pageTurnSound',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(data.enabled));
  }else if(data.action==='reader-mode-keys'){
    if(!validReaderModeKeys(data.keys))throw new Error('2つのモードに別々のキーを選んでください。');
    if(data.keys.pan===defaultReaderModeKeys.pan&&data.keys.memo===defaultReaderModeKeys.memo)sqlite.prepare("DELETE FROM preferences WHERE key='readerModeKeys'").run();
    else sqlite.prepare("INSERT INTO preferences VALUES('readerModeKeys',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({pan:data.keys.pan,memo:data.keys.memo}));
  }else if(data.action==='web'){
    if(!validWebPreferences(data.preferences))throw new Error('本文の表示設定を確認してください。');
    sqlite.prepare("INSERT INTO preferences VALUES('webReading',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(data.preferences));
  }else if(data.action==='font'){
    if(!['normal','large'].includes(data.fontSize))throw new Error('文字サイズを選んでください。');
    sqlite.prepare("INSERT INTO preferences VALUES('fontSize',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(data.fontSize);
  }else{
    if(!['reading','bookmark','view'].includes(data.action)||typeof data.bookId!=='string')throw new Error('操作を確認してください。');
    const book=await findBook('local-pc',data.bookId);
    const page=data.action==='view'?data.view?.page:data.page;
    if(!book||!Number.isInteger(page)||page<1||page>book.pageCount)throw new Error('教材とページを確認してください。');
    const now=new Date().toISOString();
    if(data.action==='view'){
      if(!validReaderView(data.view)||data.view.capturedAt>Date.now()+60000)throw new Error('読書位置の情報が正しくありません。');
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const saved=sqlite.prepare('INSERT INTO reader_views VALUES(?,?,?) ON CONFLICT(book_id) DO UPDATE SET state=excluded.state,captured_at=excluded.captured_at WHERE excluded.captured_at>=reader_views.captured_at').run(book.id,JSON.stringify(data.view),data.view.capturedAt);
        if(saved.changes)sqlite.prepare('INSERT INTO reading_positions VALUES(?,?,?) ON CONFLICT(book_id) DO UPDATE SET page=excluded.page,updated_at=excluded.updated_at').run(book.id,page,new Date(data.view.capturedAt).toISOString());
        sqlite.exec('COMMIT');
      }catch(e){sqlite.exec('ROLLBACK');throw e;}
    }else if(data.action==='reading')sqlite.prepare('INSERT INTO reading_positions VALUES(?,?,?) ON CONFLICT(book_id) DO UPDATE SET page=excluded.page,updated_at=excluded.updated_at').run(book.id,data.page,now);
    else if(typeof data.saved!=='boolean')throw new Error('しおりの状態を確認してください。');
    else if(data.saved)sqlite.prepare('INSERT INTO bookmarks VALUES(?,?,?) ON CONFLICT(book_id,page) DO NOTHING').run(book.id,data.page,now);
    else sqlite.prepare('DELETE FROM bookmarks WHERE book_id=? AND page=?').run(book.id,data.page);
  }
  return studyState();
}
