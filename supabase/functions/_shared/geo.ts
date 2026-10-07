/** Approximate location of an IP for the approval sheet. Free lookup, no key, swappable here. */

export interface GeoResult {
  ip: string;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
}

const LOOKUP_TIMEOUT_MS = 3000;

/** The caller's IP from the proxy headers Supabase sets, or null. */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first && first.length > 0 ? first : (req.headers.get('x-real-ip') ?? null);
}

export async function geoLookup(ip: string | null): Promise<GeoResult | null> {
  if (!ip || isPrivate(ip)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      success?: boolean;
      city?: string;
      region?: string;
      country?: string;
      country_code?: string;
    };
    if (body.success === false) return null;
    return {
      ip,
      city: body.city ?? null,
      region: body.region ?? null,
      country: body.country ?? null,
      country_code: body.country_code ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isPrivate(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  );
}
