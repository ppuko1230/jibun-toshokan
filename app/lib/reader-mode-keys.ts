export type ReaderModeKeys={pan:string;memo:string};
export const defaultReaderModeKeys:ReaderModeKeys={pan:'Digit1',memo:'Digit2'};
const allowed=/^(Digit[0-9]|Key[A-Z]|Numpad[0-9]|F[2-4]|F[6-9]|F10|Space|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|IntlBackslash|IntlYen|IntlRo|Home|End|PageUp|PageDown|Insert|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
export function validModeKey(code:unknown):code is string{return typeof code==='string'&&allowed.test(code);}
export function validReaderModeKeys(value:unknown):value is ReaderModeKeys{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||!Object.keys(value).every(key=>key==='pan'||key==='memo'))return false;
  const keys=value as ReaderModeKeys;return validModeKey(keys.pan)&&validModeKey(keys.memo)&&keys.pan!==keys.memo;
}
export function modeKeyLabel(code:string){
  if(/^(Digit|Key)/.test(code))return code.replace(/^(Digit|Key)/,'');
  if(code.startsWith('Numpad'))return 'テンキー '+code.slice(6);
  const labels:Record<string,string>={Space:'Space',Backquote:'`',Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',IntlBackslash:'\\',IntlYen:'￥',IntlRo:'ろ',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'};
  return labels[code]||code;
}
export function readerModeForKey(event:{code:string;ctrlKey:boolean;altKey:boolean;metaKey:boolean;shiftKey:boolean;isComposing:boolean},keys:ReaderModeKeys){
  if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing)return null;
  return event.code===keys.pan?'pan':event.code===keys.memo?'memo':null;
}
