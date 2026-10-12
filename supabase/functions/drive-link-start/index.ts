/**
 * drive-link-start (child spec 0001-drive-redundancy, AC-1): the Admin asks for the Google consent
 * URL of slot `a` or `b`. The `state` carries the slot, the Admin and the app deep link to return
 * to, signed with DRIVE_STATE_SECRET and valid for 10 minutes.
 */
import { requireAdmin } from '../_shared/auth.ts';
import { handle, HttpError, json, readJson } from '../_shared/errors.ts';
import { authUrl, isAllowedReturnUrl, signState, SLOTS, type Slot } from '../_shared/google.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const admin = await requireAdmin(req);
    const body = await readJson<{ slot?: string; return_url?: string }>(req);
    const slot = String(body.slot ?? '') as Slot;
    if (!SLOTS.includes(slot)) throw new HttpError(400, 'bad_slot');
    const returnUrl = String(body.return_url ?? '');
    if (!isAllowedReturnUrl(returnUrl)) throw new HttpError(400, 'bad_return_url');
    const state = await signState({
      slot,
      admin: admin.user.id,
      return_url: returnUrl,
      nonce: crypto.randomUUID(),
      exp: Date.now() + 10 * 60 * 1000,
    });
    return json({ auth_url: authUrl(state) });
  }),
);
