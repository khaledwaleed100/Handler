import { Match } from './models';

const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
const icsEscape = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\n/g, '\\n');

/** Downloads an .ics file so the match lands in the phone's calendar (90 min, reminder 2 h before). */
export const downloadCalendarEvent = (match: Pick<Match, '_id' | 'place' | 'kickoff' | 'mapUrl'>, title: string) => {
  const start = new Date(match.kickoff);
  const end = new Date(start.getTime() + 90 * 60000);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//5-a-side//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${match._id}@five-a-side`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `LOCATION:${icsEscape(match.place)}`,
    match.mapUrl ? `URL:${match.mapUrl}` : '',
    `URL;VALUE=URI:${location.origin}/matches/${match._id}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'match.ics';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Google Maps search link when the organizer didn't paste one. */
export const mapLink = (match: Pick<Match, 'place' | 'mapUrl'>) =>
  match.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.place)}`;

/** WhatsApp chat link for a phone number. */
export const whatsappLink = (phone: string) => `https://wa.me/${phone.replace(/[^\d]/g, '').replace(/^0/, '20')}`;

/** Local date + time inputs → ISO string. */
export const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString();

export const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const ratingTier = (overall: number) =>
  overall >= 80 ? 'elite' : overall >= 70 ? 'gold' : overall >= 60 ? 'silver' : 'bronze';
