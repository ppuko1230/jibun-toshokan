export type CodeToken={text:string;kind?:'comment'|'string'|'keyword'|'type'|'function'|'number'|'macro'|'operator'|'directive'|'section'};
const keywords=new Set('alignas alignof asm auto break case catch class const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do dynamic_cast else enum explicit export extern final for friend goto if inline mutable namespace new noexcept operator override private protected public register reinterpret_cast requires return sizeof static static_assert static_cast struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while abstract as base checked delegate event fixed foreach get implicit in interface internal is lock null object out params partial readonly ref sealed set stackalloc string typeof unchecked unsafe value var where'.split(' '));
const types=new Set('bool byte char char8_t char16_t char32_t decimal double float int int8 int16 int32 int64 long sbyte short signed uint uint8 uint16 uint32 uint64 ulong unsigned ushort void wchar_t size_t'.split(' '));
// Lexical highlighting only: always preserve the original characters, including whitespace.
export function codeTokens(text:string,file=''):CodeToken[]{
  if(/\.ini$/i.test(file))return iniTokens(text);
  const result:CodeToken[]=[];
  const pattern=/(?:u8|[uUL])?R"([^\s()\\]{0,16})\([\s\S]*?\)\1"|\/\*[\s\S]*?(?:\*\/|(?![\s\S]))|\/\/[^\r\n]*|@"(?:""|[^"])*(?:"|$)|(?:u8|[uUL])?"(?:\\[\s\S]|[^"\\\r\n])*(?:"|$)|(?:u8|[uUL])?'(?:\\[\s\S]|[^'\\\r\n])*(?:'|$)|^[\t ]*#[\t ]*[A-Za-z_]+|\b(?:0[xX][\da-fA-F']+(?:\.[\da-fA-F']*)?(?:[pP][+-]?\d+)?|0[bB][01']+|\d[\d']*(?:\.\d[\d']*)?(?:[eE][+-]?\d+)?)(?:[uUlLfF]+)?\b|\b[A-Za-z_][A-Za-z_0-9]*\b|[+*/%=!<>&|^~?:-]+/gm;
  let cursor=0;
  for(const match of text.matchAll(pattern)){
    if(match.index!>cursor)result.push({text:text.slice(cursor,match.index)});
    const value=match[0],after=text.slice(match.index!+value.length);
    let kind:CodeToken['kind'];
    if(value.startsWith('//')||value.startsWith('/*'))kind='comment';
    else if(/^(?:(?:u8|[uUL])?R"|@"|(?:u8|[uUL])?["'])/.test(value))kind='string';
    else if(/^\s*#/.test(value))kind='directive';
    else if(/^\d/.test(value)||['true','false','nullptr'].includes(value))kind='number';
    else if(keywords.has(value))kind='keyword';
    else if(types.has(value))kind='type';
    else if(/^[A-Z_][A-Z_0-9]*$/.test(value)&&value.length>1)kind='macro';
    else if(/^(?:[AUFETIS][A-Z][A-Za-z_0-9]*|T[A-Z][A-Za-z_0-9]*)$/.test(value))kind='type';
    else if(/^\s*\(/.test(after))kind='function';
    else if(/^[+*/%=!<>&|^~?:-]+$/.test(value))kind='operator';
    result.push({text:value,kind});cursor=match.index!+value.length;
  }
  if(cursor<text.length)result.push({text:text.slice(cursor)});
  return result;
}
function iniTokens(text:string):CodeToken[]{
  const result:CodeToken[]=[];let cursor=0;
  for(const match of text.matchAll(/^[\t ]*[;#][^\r\n]*|^\[[^\r\n]*\]|^[\t ]*[^=\r\n]+(?==)|"(?:\\.|[^"\\])*"|\b(?:true|false|\d+)\b|=/gm)){
    if(match.index!>cursor)result.push({text:text.slice(cursor,match.index)});
    const value=match[0],kind:CodeToken['kind']=/^\s*[;#]/.test(value)?'comment':value.startsWith('[')?'section':value.startsWith('"')?'string':value==='='?'operator':/^(true|false|\d+)$/.test(value)?'number':'type';
    result.push({text:value,kind});cursor=match.index!+value.length;
  }
  if(cursor<text.length)result.push({text:text.slice(cursor)});return result;
}
export function codeSegmentTokens(parts:string[],file=''):CodeToken[][]{
  const tokens=codeTokens(parts.join('\n'),file);let tokenIndex=0,offset=0;
  return parts.map((part,i)=>{let remaining=part.length+(i<parts.length-1?1:0);const result:CodeToken[]=[];
    while(remaining>0){const token=tokens[tokenIndex],count=Math.min(remaining,token.text.length-offset);result.push({text:token.text.slice(offset,offset+count),kind:token.kind});remaining-=count;offset+=count;if(offset===token.text.length){tokenIndex++;offset=0;}}
    return result;
  });
}
