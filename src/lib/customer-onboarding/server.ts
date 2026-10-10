import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { CustomerError, onboardingOrigin } from './contract';

export function customerClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || process.env.CUSTOMER_ONBOARDING_DATABASE_URL !== url)
    throw new CustomerError('ONBOARDING_UNAVAILABLE',503);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function checkOrigin(req:Request) {
  const origin=onboardingOrigin();
  if (req.headers.get('origin')!==origin || new URL(req.url).origin!==origin)
    throw new CustomerError('ORIGIN_NOT_ALLOWED',403);
  return origin;
}
export async function requestBody(req:Request) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new CustomerError('INVALID_INPUT');
  if (Number(req.headers.get('content-length')||0)>4096) throw new CustomerError('INVALID_INPUT',413);
  const reader=req.body?.getReader();
  if (!reader) throw new CustomerError('INVALID_INPUT');
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done)break;
      size+=value.byteLength; if(size>4096){await reader.cancel();throw new CustomerError('INVALID_INPUT',413);} chunks.push(value); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new CustomerError('INVALID_INPUT'); }
  } finally { reader.releaseLock(); }
}
export function clientHash(req:Request) {
  const address = process.env.VERCEL ? req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : 'local';
  if (!address) throw new CustomerError('ONBOARDING_UNAVAILABLE',503);
  return createHash('sha256').update(address).digest('hex');
}
export function customerJson(value:unknown,status=200) {
  return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
}
export function customerFailure(error:unknown) {
  const known=error instanceof CustomerError;
  return customerJson({ok:false,error:known?error.code:'ONBOARDING_UNAVAILABLE'},known?error.status:503);
}
