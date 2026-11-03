/* Deploy as store-admin. Private credentials are read only from the server environment. */
export function createHandler({env, fetchImpl = fetch}: {env: (name: string) => string | undefined; fetchImpl?: typeof fetch}) {
  const url = env('SUPABASE_URL') || '';
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || '';
  const origins = (env('STORE_ALLOWED_ORIGINS') || 'https://scorpion7788ghost-web.github.io').split(',').map(value => value.trim());
  class Failure extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
  async function api(path: string, {token = key, method = 'GET', body, count = false}: {token?: string; method?: string; body?: unknown; count?: boolean} = {}) {
    const headers: Record<string, string> = {apikey: key, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'};
    if (count) headers.Prefer = 'count=exact';
    const response = await fetchImpl(url + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)});
    const text = await response.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Failure(502, 'Account service returned an invalid response.'); }
    if (!response.ok) {
      if (data?.error_code === 'email_exists' || data?.code === 'email_exists' || response.status === 409) throw new Failure(409, 'That username already exists for this account type.');
      throw new Failure(response.status >= 500 ? 503 : response.status, response.status >= 500 ? 'Account service is unavailable. Please try again.' : 'The account service rejected this request. Check the account details and administrator setup.');
    }
    return {data, response};
  }
  function text(value: unknown, label: string, max: number, required = false) {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Failure(422, 'Enter a valid ' + label + '.');
    return value.trim();
  }
  async function readBody(request: Request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Failure(415, 'Send JSON account details.');
    const reader = request.body?.getReader(); if (!reader) throw new Failure(422, 'Account details are required.');
    let total = 0; const chunks: Uint8Array[] = [];
    while (true) { const {done, value} = await reader.read(); if (done) break; total += value.length; if (total > 8192) { await reader.cancel(); throw new Failure(413, 'Account details are too large.'); } chunks.push(value); }
    const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error(); return value; }
    catch { throw new Failure(422, 'Account details must be a JSON object.'); }
  }
  return async (request: Request) => {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-LK-Admin-Version': '2', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'};
    if (origin && origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers});
    try {
      if (origin && !origins.includes(origin)) throw new Failure(403, 'This website is not allowed.');
      if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers});
      if (!['GET', 'POST', 'DELETE'].includes(request.method)) throw new Failure(405, 'Method not allowed.');
      if (!url || !key) throw new Failure(503, 'Administrator service setup is incomplete.');
      const bearer = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (!bearer || bearer === key) throw new Failure(401, 'Sign in with an administrator account.');
      let caller;
      try { caller = (await api('/auth/v1/user', {token: bearer})).data; }
      catch { throw new Failure(401, 'Your session expired. Please sign in again.'); }
      if (!caller?.id) throw new Failure(401, 'Please sign in again.');
      const membership = (await api('/rest/v1/rpc/lk_is_admin', {method: 'POST', token: bearer, body: {}})).data;
      if (membership !== true) throw new Failure(403, 'Administrator access is required.');

      if (request.method === 'GET') {
        const params = new URL(request.url).searchParams;
        const page = Number(params.get('page') || 1), role = params.get('role') || 'all', search = params.get('search') || '';
        if (!Number.isInteger(page) || page < 1 || page > 100000 || !['all', 'customer', 'seller', 'worker'].includes(role) || !/^[a-zA-Z0-9_]{0,30}$/.test(search)) throw new Failure(422, 'Choose a valid page, account type, or username search.');
        const query = new URLSearchParams({select: 'auth_id,id,role,username,name,email,created_at,verification_status', order: 'created_at.desc,auth_id.asc', limit: '25', offset: String((page - 1) * 25)});
        if (role !== 'all') query.set('role', 'eq.' + role);
        if (search) query.set('username', 'ilike.*' + search.toLowerCase().replaceAll('_', '\\_') + '*');
        const {data, response} = await api('/rest/v1/lk_profiles?' + query, {count: true});
        const admins = (await api('/rest/v1/lk_admins?select=auth_id')).data;
        return reply({users: data.map((user: {auth_id: string}) => ({...user, isAdmin: admins.some((admin: {auth_id: string}) => admin.auth_id === user.auth_id)})), total: Number(response.headers.get('content-range')?.split('/')[1] || data.length), page, pageSize: 25});
      }
      const input = await readBody(request);
      if (request.method === 'POST') {
        const role = input.role;
        if (!['customer', 'seller', 'worker'].includes(role)) throw new Failure(422, 'Choose Customer, Seller, or Worker.');
        const username = text(input.username, 'username', 30, true).toLowerCase();
        if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Failure(422, 'Use 3–30 letters, numbers, or underscores for the username.');
        const name = text(input.name, 'name', 80, true), email = text(input.email ?? '', 'contact email', 120);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Failure(422, 'Enter a valid contact email.');
        if (typeof input.password !== 'string' || new TextEncoder().encode(input.password).length < 12 || new TextEncoder().encode(input.password).length > 72) throw new Failure(422, 'Use a password between 12 and 72 bytes.');
        const {data} = await api('/auth/v1/admin/users', {method: 'POST', body: {email: username + '@' + role + '.lk-store.invalid', password: input.password, email_confirm: true, app_metadata: {lk_managed: true}, user_metadata: {role, username, name, contact_email: email}}});
        return reply({ok: true, user: {auth_id: (data.user || data).id, role, username, name, email}}, 201);
      }
      const id = text(input.authId, 'account ID', 36, true);
      if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new Failure(422, 'Choose a valid account.');
      if (id === caller.id) throw new Failure(403, 'You cannot delete your own administrator account.');
      const admins = (await api('/rest/v1/lk_admins?select=auth_id&auth_id=eq.' + id)).data;
      if (admins.length) throw new Failure(403, 'Administrator accounts are protected from deletion.');
      const target = (await api('/rest/v1/lk_profiles?select=username,role&auth_id=eq.' + id)).data[0];
      if (!target) throw new Failure(404, 'That account no longer exists.');
      if (input.username !== target.username) throw new Failure(422, 'Type the account username to confirm deletion.');
      await api('/auth/v1/admin/users/' + id, {method: 'DELETE', body: {should_soft_delete: false}});
      return reply({ok: true});
    } catch (error) {
      return reply({error: error instanceof Failure ? error.message : 'Account service is unavailable. Please try again.'}, error instanceof Failure ? error.status : 503);
    }
  };
}

if (typeof Deno !== 'undefined') Deno.serve(createHandler({env: (name: string) => Deno.env.get(name)}));
