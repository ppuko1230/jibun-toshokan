// Local-only namespace, never a real ChatGPT identity. server.ts enforces loopback.
export async function getChatGPTUser(){return {userId:'local-pc',email:'local@localhost'};}
export async function requireChatGPTUser(_returnTo?:string){return getChatGPTUser();}
