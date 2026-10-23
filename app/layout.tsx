import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'自分図書館 | 学びの本棚',description:'紙で読み、ここでつなぐ。教材と自分の理解を育てる学習ライブラリ。',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="ja"><body>{children}</body></html>; }
