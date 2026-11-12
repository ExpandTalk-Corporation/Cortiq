// Click interactions (nav / button / link / element) for user_interactions. The tracker only
// sends these after the visitor's analytics choice; this keeps what is stored minimal:
// short element text with emails and long digit runs (phone, order or card numbers) masked,
// and link targets without query string or fragment. mailto:/tel: keep only the scheme, so
// "clicked an email link" is countable without storing the address.
const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi;
const DIGITS = /\+?\d[\d\s().-]{5,}\d/g;

function clip(value, max) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
}

export function maskText(value, max = 100) {
  const s = clip(value, 500);
  if (!s) return null;
  return clip(s.replace(EMAIL, '[email]').replace(DIGITS, '[number]'), max);
}

export function storedHref(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const u = new URL(raw.slice(0, 2048));
    if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') return u.protocol;
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.host) return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(EMAIL, '[email]')}`.slice(0, 1024);
  } catch {
    return null;
  }
}

// Returns the columns to store, or null when the event is not a usable interaction.
export function sanitizeInteraction(m) {
  if (!m || typeof m !== 'object') return null;
  const type = typeof m.interaction_type === 'string' ? m.interaction_type.toLowerCase() : '';
  if (!/^[a-z][a-z_]{0,39}$/.test(type)) return null;
  const tag = typeof m.element_tag === 'string' ? m.element_tag.toLowerCase() : '';
  return {
    interaction_type: type,
    element_tag: /^[a-z][a-z0-9-]{0,30}$/.test(tag) ? tag : null,
    element_id: maskText(m.element_id, 100),
    element_class: clip(m.element_class, 100),
    element_text: maskText(m.element_text, 100),
    element_href: storedHref(m.href),
  };
}
