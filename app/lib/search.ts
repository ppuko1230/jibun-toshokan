export const aliases = [
  ['subsystem','サブシステム'], ['setupattachment','取り付け','アタッチ'],
  ['springarm','スプリングアーム','カメラアーム'], ['pointer','ポインター','ポインタ'],
  ['auto*','型推論'], ['playercontroller','プレイヤーコントローラー','プレイヤーコントローラ'],
  ['enhancedinput','エンハンストインプット'], ['linetrace','ライントレース'],
  ['component','コンポーネント'], ['actor','アクター'], ['nullptr','ヌルポインタ'],
];
export const normalize = (s:string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
export function queryGroups(q:string) {
  return q.trim().split(/\s+/).filter(Boolean).slice(0,10).map(t=>{
    const n=normalize(t); const a=aliases.find(g=>g.some(x=>normalize(x)===n));
    return [...new Set([n,...(a||[]).map(normalize)])];
  });
}
export function matches(text:string,groups:string[][]) { const n=normalize(text); return groups.every(g=>g.some(t=>n.includes(t))); }
export function excerpt(text:string,groups:string[][],limit=260) {
  const plain=text.replace(/\s+/g,' ').trim();
  const lower=plain.normalize('NFKC').toLowerCase();
  const positions=groups.flat().map(t=>lower.indexOf(t)).filter(i=>i>=0);
  const start=Math.max(0,(positions.length?Math.min(...positions):0)-65);
  return (start?'…':'')+plain.slice(start,start+limit)+(plain.length>start+limit?'…':'');
}
