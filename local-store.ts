import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,unlinkSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const appRoot=process.env.YOHAKU_APP_ROOT||fileURLToPath(new URL('.',import.meta.url));
const installationPath=join(appRoot,'installation.json');
export const installation=existsSync(installationPath)?JSON.parse(readFileSync(installationPath,'utf8')):null;
if(installation&&(installation.format!=='yohaku-installation-v1'||typeof installation.dataRoot!=='string'))throw new Error('Invalid installation data location');
export const dataRoot=resolve(process.env.YOHAKU_DATA_DIR||installation?.dataRoot||join(appRoot,'data'));
mkdirSync(dataRoot,{recursive:true});mkdirSync(join(dataRoot,'pdfs'),{recursive:true});
export const sqlite=new DatabaseSync(join(dataRoot,'library.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
sqlite.exec(`CREATE TABLE IF NOT EXISTS textbooks(id TEXT PRIMARY KEY,owner TEXT NOT NULL,title TEXT NOT NULL,filename TEXT NOT NULL,hash TEXT NOT NULL,bytes INTEGER NOT NULL,page_count INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS textbooks_owner_hash ON textbooks(owner,hash);
CREATE TABLE IF NOT EXISTS pages(book_id TEXT NOT NULL REFERENCES textbooks(id),page INTEGER NOT NULL,label TEXT NOT NULL,content TEXT NOT NULL,PRIMARY KEY(book_id,page));
CREATE TABLE IF NOT EXISTS notes(owner TEXT NOT NULL,book_id TEXT NOT NULL,page INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner,book_id,page));
CREATE TABLE IF NOT EXISTS term_memos(id TEXT PRIMARY KEY,owner TEXT NOT NULL,term TEXT NOT NULL,body TEXT NOT NULL,source_book_id TEXT,source_page INTEGER,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS term_names(owner TEXT NOT NULL,name_key TEXT NOT NULL,display TEXT NOT NULL,memo_id TEXT NOT NULL REFERENCES term_memos(id),PRIMARY KEY(owner,name_key));
CREATE TABLE IF NOT EXISTS learning_challenges(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,page INTEGER NOT NULL,block_id TEXT,quote TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reading_positions(book_id TEXT PRIMARY KEY,page INTEGER NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reader_views(book_id TEXT PRIMARY KEY,state TEXT NOT NULL,captured_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bookmarks(book_id TEXT NOT NULL,page INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(book_id,page));
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
// False rows remember an explicit undo when merging older backups.
sqlite.exec('CREATE TABLE IF NOT EXISTS book_completion(book_id TEXT PRIMARY KEY,completed INTEGER NOT NULL CHECK(completed IN (0,1)),updated_at TEXT NOT NULL);');
sqlite.exec('CREATE TABLE IF NOT EXISTS book_trash(owner TEXT NOT NULL,book_id TEXT NOT NULL,deleted_at TEXT NOT NULL,PRIMARY KEY(owner,book_id));');
// Additive tables keep every legacy memo and its unique global name untouched.
sqlite.exec(`CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,owner TEXT NOT NULL,name TEXT NOT NULL,name_key TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(owner,name_key));
CREATE TABLE IF NOT EXISTS book_folders(owner TEXT NOT NULL,book_id TEXT NOT NULL,folder_id TEXT NOT NULL REFERENCES folders(id),PRIMARY KEY(owner,book_id));
CREATE TABLE IF NOT EXISTS folder_term_memos(id TEXT PRIMARY KEY,owner TEXT NOT NULL,folder_id TEXT NOT NULL REFERENCES folders(id),term TEXT NOT NULL,body TEXT NOT NULL,source_book_id TEXT,source_page INTEGER,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS folder_term_names(owner TEXT NOT NULL,folder_id TEXT NOT NULL REFERENCES folders(id),name_key TEXT NOT NULL,display TEXT NOT NULL,memo_id TEXT NOT NULL REFERENCES folder_term_memos(id),PRIMARY KEY(owner,folder_id,name_key));`);
class Statement {
  values:any[]=[];
  constructor(public sql:string){}
  bind(...values:any[]){const s=new Statement(this.sql);s.values=values;return s;}
  async all<T=any>():Promise<{results:T[]}>{return {results:sqlite.prepare(this.sql).all(...this.values) as T[]};}
  async first<T=any>():Promise<T|null>{return sqlite.prepare(this.sql).get(...this.values) as T||null;}
  execute(){return sqlite.prepare(this.sql).run(...this.values);}
  async run(){return this.execute();}
}
export const localDatabase={
  prepare(sql:string){return new Statement(sql);},
  async batch(items:Statement[]){sqlite.exec('BEGIN IMMEDIATE');try{const results=items.map(s=>s.execute());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
};
function pdfPath(key:string){const p=resolve(dataRoot,'pdfs',key);if(!p.startsWith(resolve(dataRoot,'pdfs')+sep))throw new Error('Invalid PDF path');return p;}
export const localBucket={
  async put(key:string,data:ArrayBuffer,_options?:unknown){const p=pdfPath(key);mkdirSync(resolve(p,'..'),{recursive:true});writeFileSync(p,new Uint8Array(data));},
  async get(key:string){const p=pdfPath(key);if(!existsSync(p))return null;const body=new Uint8Array(readFileSync(p));return {body,size:body.byteLength};},
  async delete(key:string){const p=pdfPath(key);if(existsSync(p))unlinkSync(p);}
};
export function snapshot(force=false){
  const dir=join(dataRoot,'backups');mkdirSync(dir,{recursive:true});
  const name=force?'before-import-'+Date.now()+'.sqlite':'daily-'+new Date().toISOString().slice(0,10)+'.sqlite';
  const target=join(dir,name);
  if(!existsSync(target))sqlite.exec("VACUUM INTO '"+target.replace(/'/g,"''")+"'");
  const daily=readdirSync(dir).filter(n=>/^daily-.*\.sqlite$/.test(n)).sort();
  for(const old of daily.slice(0,-14))unlinkSync(join(dir,old));
}
snapshot();
