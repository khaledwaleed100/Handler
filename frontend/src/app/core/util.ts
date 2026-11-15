import { Match } from './models';

const pad = (n: number) => String(n).padStart(2, '0');
const icsDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

/** Link that opens Google Calendar with the match pre-filled (90 min). The player just taps Save. */
export const googleCalendarLink = (match: Pick<Match, '_id' | 'place' | 'kickoff' | 'mapUrl'>, title: string) => {
  const start = new Date(match.kickoff);
  const end = new Date(start.getTime() + 90 * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsDate(start)}/${icsDate(end)}`,
    location: match.place,
    details: [match.mapUrl, `${location.origin}/matches/${match._id}`].filter(Boolean).join('\n')
  });
  return `https://calendar.google.com/calendar/render?${params}`;
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
