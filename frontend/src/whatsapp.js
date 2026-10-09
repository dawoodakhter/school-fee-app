// Turns a Pakistani phone number into WhatsApp format (923001234567).
export function whatsappNumber(contact) {
  let d = String(contact || '').replace(/\D/g, '');
  if (d.startsWith('0092')) d = d.slice(2);
  if (d.startsWith('92') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return '92' + d.slice(1);
  if (d.length === 10 && d.startsWith('3')) return '92' + d;
  return '';
}

export const DEFAULT_REMINDER =
  'Assalam o Alaikum. This is a gentle reminder from {school}. ' +
  'The fee of {name} (class {class}) is pending: Rs {amount}. ' +
  'Please pay at your earliest convenience. JazakAllah.';

export function fillReminder(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, k) =>
    values[k] !== undefined ? String(values[k]) : m
  );
}

export function whatsappLink(contact, message) {
  const n = whatsappNumber(contact);
  if (!n) return '';
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}