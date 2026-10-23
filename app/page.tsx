import { requireChatGPTUser } from './chatgpt-auth';
import StudyApp from './study-app';
export const dynamic = 'force-dynamic';
export default async function Page() { await requireChatGPTUser('/'); return <StudyApp/>; }
