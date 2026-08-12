import { onRequestGet as getCdnTraffic } from './data/cdn-traffic.js';
import {
  onRequestGet as getTenantConnect,
  onRequestPost as postTenantConnect,
} from './tenant/connect.js';

function notFound() {
  return new Response(JSON.stringify({ error: 'not_found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const method = context.request.method;

  if (url.pathname === '/api/data/cdn-traffic' && method === 'GET') {
    return getCdnTraffic(context);
  }

  if (url.pathname === '/api/tenant/connect' && method === 'GET') {
    return getTenantConnect(context);
  }

  if (url.pathname === '/api/tenant/connect' && method === 'POST') {
    return postTenantConnect(context);
  }

  return notFound();
}
