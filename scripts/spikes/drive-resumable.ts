/**
 * Spike: can a client PUT chunks to a Google Drive resumable upload session URI
 * WITHOUT an Authorization header? This decides whether F2H uploads straight from
 * the phone (direct) or proxies bytes through an Edge Function (proxy).
 *
 * Run (Node 20+, no dependencies):
 *   DRIVE_ACCESS_TOKEN=ya29... npx tsx scripts/spikes/drive-resumable.ts
 *
 * Get a one off access token with the drive.file scope from the OAuth Playground
 * (https://developers.google.com/oauthplayground) or any linked account. The token
 * is used ONLY to open the session (server side in the real app). The chunk PUTs
 * below deliberately send no Authorization header.
 *
 * Record the outcome in docs/specs/0001-system-architecture/rationale.md
 * under "Drive spike result".
 */

const token = process.env.DRIVE_ACCESS_TOKEN;
if (!token) {
  console.error('Set DRIVE_ACCESS_TOKEN');
  process.exit(1);
}

const CHUNK = 256 * 1024; // Google requires multiples of 256 KiB
const TOTAL = CHUNK * 3;
const payload = new Uint8Array(TOTAL);
for (let i = 0; i < TOTAL; i++) payload[i] = i % 251;

async function main() {
  // 1. Open the session with the token (this is what the Edge Function does).
  const open = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,sha256Checksum',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/octet-stream',
        'X-Upload-Content-Length': String(TOTAL),
      },
      body: JSON.stringify({ name: `f2h-spike-${Date.now()}.bin` }),
    },
  );
  if (!open.ok) throw new Error(`open session failed: ${open.status} ${await open.text()}`);
  const session = open.headers.get('location');
  if (!session) throw new Error('no session URI');
  console.log('session opened');

  // 2. PUT chunks with NO Authorization header.
  let last: Response | undefined;
  for (let start = 0; start < TOTAL; start += CHUNK) {
    const end = Math.min(start + CHUNK, TOTAL);
    last = await fetch(session, {
      method: 'PUT',
      headers: {
        'Content-Length': String(end - start),
        'Content-Range': `bytes ${start}-${end - 1}/${TOTAL}`,
      },
      body: payload.subarray(start, end),
    });
    console.log(`chunk ${start}-${end - 1}: HTTP ${last.status}`);
    if (last.status !== 308 && !last.ok) {
      throw new Error(`chunk PUT failed: ${last.status} ${await last.text()}`);
    }
  }

  // 3. Query the session state (also without auth) and print the file metadata.
  const probe = await fetch(session, {
    method: 'PUT',
    headers: { 'Content-Length': '0', 'Content-Range': `bytes */${TOTAL}` },
  });
  console.log(`probe: HTTP ${probe.status}`);
  console.log('final response:', last && (await last.text()));
  console.log(
    '\nRESULT: direct upload WITHOUT Authorization header works (PUTs returned 308/200).',
  );
}

main().catch((err) => {
  console.error('RESULT: direct upload failed; fall back to proxy mode.\n', err);
  process.exit(2);
});
