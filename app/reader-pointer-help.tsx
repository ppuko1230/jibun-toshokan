/** Mouse-button highlights explain gestures without adding another mode switch. */
export default function ReaderPointerHelp(){
  return <div className="book-pointer-help" aria-label="紙面のマウス操作" title="左ドラッグで文字選択。右ドラッグでつかんで移動。Space＋左ドラッグ、中ボタンドラッグでも移動できます。">
    <span><MouseButton side="left"/><span><strong>左ドラッグ</strong><span>文字選択</span></span></span>
    <span><MouseButton side="right"/><span><strong>右ドラッグ</strong><span>つかんで移動</span></span></span>
  </div>;
}
function MouseButton({side}:{side:'left'|'right'}){
  return <svg className="mouse-button-icon" viewBox="0 0 24 32" width="24" height="32" fill="none" aria-hidden="true" focusable="false">
    <path d="M3 16V11a9 9 0 0 1 9-9v14Z" fill={side==='left'?'currentColor':'transparent'}/>
    <path d="M12 2a9 9 0 0 1 9 9v5h-9Z" fill={side==='right'?'currentColor':'transparent'}/>
    <rect x="3" y="2" width="18" height="28" rx="9" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M3 16h18M12 2v14" stroke="currentColor" strokeWidth="1.4"/>
    <rect x="10.6" y="6" width="2.8" height="6" rx="1.4" fill="var(--sand1)" stroke="currentColor" strokeWidth="1"/>
  </svg>;
}
