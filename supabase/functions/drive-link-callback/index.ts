/**
 * drive-link-callback (child spec 0001-drive-redundancy, AC-1): Google redirects here with the
 * code. The signed state names the slot and the Admin; the refresh token goes straight into Vault
 * through `drive_link_account`, and the browser is sent back to the app deep link. Deployed with
 * `--no-verify-jwt` because Google's redirect carries no Supabase session.
 */
import { HttpError } from '../_shared/errors.ts';
import {
  aboutEmail,
  createFolder,
  exchangeCode,
  getFile,
  ROOT_FOLDER,
  verifyState,
} from '../_shared/google.ts';
import { serviceClient } from '../_shared/supabase.ts';

function page(title: string, text: string, link?: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;padding:32px;background:#F5F8FF;color:#14181F"><h2>${esc(title)}</h2><p>${esc(text)}</p>${link ? `<p><a href="${esc(link)}" style="color:#2F5BEA">Return to F2H</a></p>` : ''}</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function back(returnUrl: string, params: Record<string, string>): Response {
  const sep = returnUrl.includes('?') ? '&' : '?';
  const target = `${returnUrl}${sep}${new URLSearchParams(params).toString()}`;
  return new Response(null, { status: 302, headers: { Location: target } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const rawState = url.searchParams.get('state') ?? '';
  let state;
  try {
    state = await verifyState(rawState);
  } catch {
    return page('Link expired', 'This Google link is no longer valid. Start again from F2H.');
  }
  const googleError = url.searchParams.get('error');
  if (googleError) return back(state.return_url, { slot: state.slot, status: 'cancelled' });
  const code = url.searchParams.get('code');
  if (!code) return back(state.return_url, { slot: state.slot, status: 'failed' });

  try {
    const db = serviceClient();
    const { access, refresh } = await exchangeCode(code);
    const email = await aboutEmail(access);
    // Relinking the same account keeps its folder; anything else gets a fresh F2H Vault folder.
    const { data: existing } = await db
      .from('drive_accounts')
      .select('google_email, root_folder_id')
      .eq('slot', state.slot)
      .maybeSingle();
    let root: string | null = null;
    if (existing && existing.google_email === email) {
      const folder = await getFile(access, existing.root_folder_id).catch(() => null);
      if (folder && !folder.trashed) root = existing.root_folder_id;
    }
    if (!root) {
      root = await createFolder(access, ROOT_FOLDER);
      await createFolder(access, 'backups', root);
    }
    const { error } = await db.rpc('drive_link_account', {
      p_slot: state.slot,
      p_email: email,
      p_refresh_token: refresh,
      p_root_folder_id: root,
      p_linked_by: state.admin,
    });
    if (error) throw new HttpError(500, 'link_store_failed');
    return back(state.return_url, { slot: state.slot, status: 'linked' });
  } catch (e) {
    console.error('drive-link-callback', e instanceof Error ? e.message : String(e));
    return back(state.return_url, { slot: state.slot, status: 'failed' });
  }
});
