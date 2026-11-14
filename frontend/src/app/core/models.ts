/** Shapes of the data the API returns. Kept in one file so screens stay consistent. */

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Attribute = 'pace' | 'attack' | 'passing' | 'defence' | 'physical' | 'goalkeeping';
export const ATTRIBUTES: Attribute[] = ['pace', 'attack', 'passing', 'defence', 'physical', 'goalkeeping'];
export const OUTFIELD_ATTRIBUTES: Attribute[] = ['pace', 'attack', 'passing', 'defence', 'physical'];
export const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

export type Attributes = Record<Attribute, number>;
export type Badge = 'reliable' | 'mvp' | 'scorer' | 'playmaker' | 'veteran' | 'hot';
export type Result = 'W' | 'D' | 'L';

export interface PlayerStats {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goals: number;
  assists: number;
  mvp: number;
}

/** What everyone can see. */
export interface PublicPlayer {
  _id: string;
  name: string;
  position: Position;
  avatarUrl: string | null;
  overall: number;
  provisional: boolean;
  attrs: Attributes;
  stats: PlayerStats;
  form: Result[];
  badges: Badge[];
}

export interface Reliability {
  onTime: number;
  late: number;
  noShow: number;
  lateDrop: number;
}

/** What a player sees about themselves. */
export interface SelfPlayer extends PublicPlayer {
  selfRating: Attributes;
  peer: { attrs: Partial<Record<Attribute, number | null>>; raterCount: number } | null;
  resultsSkill: number;
  adjustment: number;
  reliability: Reliability;
}

export type AdjustmentReason = 'injury_return' | 'new_player' | 'plays_differently';

/** What the organizer sees about a member. */
export interface MemberView extends SelfPlayer {
  role: 'organizer' | 'member';
  contact: { email: string; phone: string | null };
  concernFlag: boolean;
  adjustmentReason: AdjustmentReason | null;
  adjustmentLog: { value: number; reason?: AdjustmentReason; at: string }[];
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'organizer' | 'member';
  phone: string;
  contactConsent: boolean;
  preferences: { theme: 'light' | 'dark'; lang: 'en' | 'ar' };
}

export interface Me {
  user: User;
  player: SelfPlayer | null;
  pushKey?: string | null;
}

export type RsvpStatus = 'in' | 'out' | 'maybe';

export interface Attendance {
  player: string;
  state: 'on_time' | 'late' | 'no_show';
  arrivedAt: string | null;
  minutesLate: number;
  dispute: { state: 'none' | 'pending' | 'accepted' | 'rejected'; note: string; at: string | null };
}

export interface Match {
  _id: string;
  place: string;
  mapUrl: string;
  kickoff: string;
  capacity: number;
  price: number;
  status: 'upcoming' | 'completed' | 'cancelled';
  rsvp: { confirmed: string[]; waitlist: string[]; maybe: string[]; out: string[] };
  myRsvp: RsvpStatus | null;
  myPlace: 'confirmed' | 'waitlist' | null;
  teamsPublished: boolean;
  teamA: string[];
  teamB: string[];
  score: { a: number; b: number } | null;
  stats: { player: string; goals: number; assists: number }[];
  mvp: string | null;
  ratings: { closesAt: string; finalized: boolean; myTaskPending: boolean; done: number; total: number } | null;
  myAttendance: Attendance | null;
  myPayment: { paid: boolean } | null;
  attendance?: Attendance[];
  payments?: { player: string; paid: boolean; at: string }[];
}

export interface MatchWithPlayers extends Match {
  players: Record<string, PublicPlayer>;
}

export interface MatchList {
  matches: Match[];
  players: Record<string, PublicPlayer>;
}

export interface TeamOption {
  teamA: string[];
  teamB: string[];
  strengthA: number;
  strengthB: number;
  balance: number;
  preferencesMet: number;
  preferencesTotal: number;
}

export interface RatingTask {
  matchId: string;
  place: string;
  kickoff: string;
  done: boolean;
  closed: boolean;
  closesAt: string;
  ratees: string[];
  players: Record<string, PublicPlayer>;
}

export interface Home {
  groupName: string;
  currency: string;
  next: MatchWithPlayers | null;
  todo: {
    rate: { matchId: string; place: string; kickoff: string; closesAt: string; count: number }[];
    unpaid: { matchId: string; place: string; kickoff: string; price: number }[];
    disputes?: number;
    needResult?: { matchId: string; place: string; kickoff: string }[];
  };
}

export interface AttendanceRecord {
  matchId: string;
  place: string;
  kickoff: string;
  state: Attendance['state'];
  arrivedAt: string | null;
  minutesLate: number;
  dispute: Attendance['dispute'];
  canDispute: boolean;
}

export interface Preferences {
  with: string[];
  avoid: string[];
  maxWith: number;
  maxAvoid: number;
}

export interface GroupSettings {
  groupName: string;
  inviteCode: string;
  lateGraceMinutes: number;
  defaultCapacity: number;
  defaultPrice: number;
  currency: string;
  ratingWindowHours: number;
}

export interface OrganizerOverview {
  settings: GroupSettings;
  members: MemberView[];
  disputes: { matchId: string; place: string; kickoff: string; playerId: string; state: string; minutesLate: number; note: string }[];
  unpaid: { playerId: string; amount: number; matches: { matchId: string; place: string; kickoff: string; price: number }[] }[];
  feedback: { _id: string; name: string; message: string; at: string }[];
}

export interface PlayerProfile {
  player: PublicPlayer;
  recent: { matchId: string; place: string; kickoff: string; result: Result; score: string; goals: number; assists: number; mvp: boolean }[];
}
