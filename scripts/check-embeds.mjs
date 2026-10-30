// By hand, not in CI (it uses the network): for each dashboard frame, the HTTP status, x-frame-options and the
// frame-ancestors directive of content-security-policy. Never prints a body.
import { DASHBOARDS } from '../src/lib/dashboards.mjs';

for (const d of DASHBOARDS) {
  try {
    const res = await fetch(d.src, { method: 'GET', redirect: 'manual' });
    await res.body?.cancel();
    const csp = res.headers.get('content-security-policy') ?? '';
    const fa = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('frame-ancestors')) ?? '(none)';
    console.log(`${d.id} ${new URL(d.src).host}: status ${res.status}; x-frame-options ${res.headers.get('x-frame-options') ?? '(none)'}; ${fa}`);
  } catch (e) {
    console.log(`${d.id} ${new URL(d.src).host}: error ${e.cause?.code ?? e.message}`);
  }
}
