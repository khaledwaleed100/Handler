/** English strings. Keys are grouped by screen. `{name}` placeholders are filled by the t pipe. */
export const en = {
  app: { name: '5-a-side', waking: 'Waking the server up…', offline: 'You are offline', retry: 'Try again', loading: 'Loading…', save: 'Save', saved: 'Saved', cancel: 'Cancel', close: 'Close', back: 'Back', next: 'Next', done: 'Done', delete: 'Delete', edit: 'Edit', yes: 'Yes', no: 'No', or: 'or', optional: 'optional', copy: 'Copy', copied: 'Copied', share: 'Share', error: 'Something went wrong', confirm: 'Are you sure?' },
  nav: { home: 'Home', matches: 'Matches', squad: 'Squad', vote: 'Vote', me: 'Me', organizer: 'Organizer' },
  pos: { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward', short_GK: 'GK', short_DEF: 'DEF', short_MID: 'MID', short_FWD: 'FWD' },
  attr: { pace: 'Pace', attack: 'Attack', passing: 'Passing', defence: 'Defence', physical: 'Physical', goalkeeping: 'Goalkeeping', short_pace: 'PAC', short_attack: 'ATT', short_passing: 'PAS', short_defence: 'DEF', short_physical: 'PHY', short_goalkeeping: 'GK' },
  badge: { reliable: 'Reliable', mvp: 'MVP ×{n}', scorer: 'Scorer', playmaker: 'Playmaker', veteran: 'Veteran', hot: 'On fire' },
  card: { provisional: 'Provisional', provisionalHint: 'Not enough ratings yet', matches: 'Matches', goals: 'Goals', assists: 'Assists', wins: 'Wins', mvps: 'MVPs', form: 'Form', formerPlayer: 'Former player' },

  auth: {
    welcome: 'Welcome back', signIn: 'Sign in', signingIn: 'Signing in…', email: 'Email', password: 'Password', forgot: 'Forgot password?',
    noAccount: 'No account? Ask the organizer for the invite link.', join: 'Join {group}', joinTitle: 'Create your player',
    invalidInvite: 'This invite link is not valid any more. Ask the organizer for a new one.', checkingInvite: 'Checking your invite…',
    name: 'Name', phone: 'Phone (WhatsApp)', position: 'Your position', newPassword: 'Password', passwordHint: 'At least 8 characters, with a letter and a number',
    selfTitle: 'Rate yourself honestly', selfHint: 'This is only a starting point. It fades out quickly once teammates rate you, so there is no point exaggerating.',
    consent: 'I agree to share my phone number and email with the organizer only. Other players never see them.',
    create: 'Create account', creating: 'Creating…', haveAccount: 'Already have an account? Sign in',
    step1: 'Account', step2: 'Player', step3: 'Self-rating',
    forgotTitle: 'Reset your password', forgotHint: 'We\'ll email you a 6-digit code.', sendCode: 'Send code', codeSent: 'If that email has an account, a code is on its way.',
    code: '6-digit code', setPassword: 'Set new password', resetDone: 'Password changed. Sign in with the new one.', backToLogin: 'Back to sign in'
  },

  home: {
    hello: 'Hi {name}', nextMatch: 'Next match', noMatch: 'No match scheduled yet', noMatchHint: 'The organizer will post the next one soon.',
    createMatch: 'Create a match', in: 'I\'m in', out: 'Can\'t make it', maybe: 'Maybe', youreIn: 'You\'re in ✅', youreOut: 'You\'re out', youreMaybe: 'You said maybe',
    waitlist: 'You\'re on the waitlist (#{n})', spots: '{n}/{cap} in', spotsLeft: '{n} spots left', full: 'Full, new replies join the waitlist',
    seeTeams: 'See the teams', todo: 'To do', rateTitle: 'Rate {n} players from {place}', rateHint: 'About 30 seconds · anonymous',
    pay: 'You owe {amount} for {place}', disputes: '{n} punctuality requests to review', needResult: 'Enter the result for {place}',
    pollOpen: 'Player of the Week vote is open', kickoffIn: 'Kick-off in {t}', startedAgo: 'Kicked off {t} ago', allDone: 'All caught up'
  },

  match: {
    upcoming: 'Upcoming', past: 'Past', newMatch: 'New match', place: 'Place', mapLink: 'Map link', date: 'Date', time: 'Kick-off', capacity: 'Players', price: 'Price per player',
    create: 'Create match', creating: 'Creating…', created: 'Match created. Everyone has been notified.', none: 'No matches here yet', cancelled: 'Cancelled', completed: 'Full time',
    addToCalendar: 'Add to calendar', directions: 'Directions', shareInvite: 'Share on WhatsApp', confirmed: 'Confirmed', waitlist: 'Waitlist', maybe: 'Maybe', out: 'Out', noReply: 'No reply yet',
    tabPlayers: 'Players', tabTeams: 'Teams', tabCheckin: 'Check-in', tabResult: 'Result', tabMoney: 'Money',
    setStatus: 'Set reply for a player', addPlayer: 'Add a player', remove: 'Remove',
    makeTeams: 'Make teams', remake: 'Suggest again', option: 'Option {n}', balance: 'Balance {n}%', prefs: '{met}/{total} wishes met', noPrefs: 'No wishes',
    publish: 'Publish teams', published: 'Teams published', unpublished: 'Draft, only you can see it', saveDraft: 'Save draft', shareTeams: 'Share teams', teamsHidden: 'Teams aren\'t out yet',
    tapToSwap: 'Tap a player, then tap another to swap them', bench: 'Not in a team', needConfirmed: 'Need at least 2 confirmed players',
    teamA: 'Team A', teamB: 'Team B', strength: 'Avg {n}',
    arrived: 'Arrived', noShow: 'No-show', late: '{n} min late', onTime: 'On time', undo: 'Undo', checkinHint: 'Tap "Arrived" as people turn up. The time is saved automatically.',
    score: 'Score', scorers: 'Goals & assists', saveResult: 'Save result', resultSaved: 'Result saved. Rating round started.', editResult: 'Edit result',
    paid: 'Paid', unpaid: 'Not paid', totalPaid: '{paid} of {total} paid',
    rateNow: 'Rate your teammates', ratedThanks: 'Thanks for rating!', ratingProgress: '{done}/{total} have rated', closeRatings: 'Close rating now', ratingsClosed: 'Ratings closed',
    mvp: 'MVP', youWereLate: 'You were marked {n} min late', youNoShow: 'You were marked as no-show', disputeSent: 'Request sent to the organizer',
    cancelMatch: 'Cancel match', deleteMatch: 'Delete match', deleteConfirm: 'Delete this match for everyone? This can\'t be undone.', cancelConfirm: 'Cancel this match? Confirmed players will be notified.',
    weather: '{temp}° · {desc}', vs: 'VS', yourPayment: 'Your share: {amount}'
  },

  rate: {
    title: 'Rate your teammates', intro: 'Rate {n} players from {place}. Nobody, not even the organizer, will see your answers.',
    playAgain: 'Happy to play with them again?', gkOptional: 'Saw them in goal?', mvpTitle: 'Who was the MVP?', mvpSkip: 'Skip MVP vote',
    submit: 'Send ratings', sending: 'Sending…', done: 'Done! Ratings stay anonymous and update when the round closes.', closed: 'Rating for this match is closed.', already: 'You already rated this match.',
    scale: { '1': 'Weak', '2': 'Below avg', '3': 'Average', '4': 'Good', '5': 'Great' }, step: '{i} of {n}'
  },

  squad: { title: 'Squad', search: 'Search players', all: 'All', sortOverall: 'Rating', sortGoals: 'Goals', sortName: 'Name', empty: 'No players found', recent: 'Recent matches', noRecent: 'No matches yet' },

  me: {
    title: 'Me', ratingHow: 'How your rating is made', fromSelf: 'Your self-rating', fromPeers: 'Teammates ({n} people)', fromResults: 'Results', peersPending: 'Shown once 4 different people have rated you',
    adjustment: 'Organizer adjustment: {n}', punctuality: 'Punctuality', onTimeOf: 'On time {a} of last {b}', lateDrops: '{n} late drop-outs', noRecord: 'No check-ins yet',
    dispute: 'This is wrong', disputeNote: 'What happened?', sendDispute: 'Send to organizer', pending: 'Waiting for organizer', accepted: 'Corrected ✅', rejected: 'Kept by organizer',
    prefsTitle: 'Who you play with', prefsPrivate: 'Completely private. Only the team-maker uses this; nobody, including the organizer, can see who you picked.',
    playWith: 'Enjoy playing with (up to {n})', avoid: 'Prefer not to be teamed with (up to {n})', pick: 'Pick', prefsSaved: 'Saved privately',
    profile: 'Profile', photo: 'Change photo', uploading: 'Uploading…', selfRating: 'Self-rating',
    app: 'App', language: 'Language', theme: 'Theme', dark: 'Dark', light: 'Light', notifications: 'Notifications', notifOn: 'On', notifOff: 'Off', notifBlocked: 'Blocked in browser settings', notifUnsupported: 'Install the app to get notifications', install: 'Install app',
    installHint: 'On iPhone: Share → Add to Home Screen. On Android: menu → Install app.',
    account: 'Account', changePassword: 'Change password', currentPassword: 'Current password', feedback: 'Send feedback to the organizer', feedbackSent: 'Thanks! Sent.', logout: 'Sign out',
    deleteAccount: 'Delete my account', deleteHint: 'Deletes your account, photo, ratings and preferences. Past match scores stay, shown as "Former player". This can\'t be undone.', deleteConfirm: 'Type your password to delete your account'
  },

  org: {
    title: 'Organizer', invite: 'Invite link', inviteHint: 'Anyone with this link can join. Reset it if it leaks.', resetInvite: 'Reset link', resetConfirm: 'The old link will stop working. Continue?',
    inviteMessage: 'Join our 5-a-side group: {link}',
    settings: 'Group settings', groupName: 'Group name', grace: 'Grace period before "late" (minutes)', defaultCapacity: 'Default players per match', defaultPrice: 'Default price per player', currency: 'Currency', ratingWindow: 'Rating round length (hours)',
    requests: 'Punctuality requests', noRequests: 'No open requests', accept: 'Accept', reject: 'Reject',
    unpaid: 'Who owes money', noUnpaid: 'Everyone has paid', members: 'Members ({n})', concern: 'A few people aren\'t enjoying games with this player',
    adjust: 'Rating adjustment', adjustHint: 'Small correction, up to 5 points either way. Fades over 5 matches. The player sees the number, not your reason.',
    reason: 'Reason', reasons: { injury_return: 'Coming back from injury', new_player: 'New, ratings haven\'t caught up yet', plays_differently: 'Plays differently than ratings show' },
    history: 'History', removeMember: 'Remove from group', removeConfirm: 'Remove {name}? Their account and ratings are deleted.', call: 'Call', whatsapp: 'WhatsApp', noPhone: 'No phone shared',
    feedback: 'Feedback', noFeedback: 'No feedback yet'
  },

  poll: {
    title: 'Vote', subtitle: 'Pick the standout player. One vote each.', live: 'Live', closed: 'Closed', weekly: 'Player of the Week', monthly: 'Player of the Month',
    votes: '{n} votes', tapThenConfirm: 'Tap a player, then confirm', yourPick: 'Your pick', confirmVote: 'Confirm vote', voted: 'Your vote is in. Results update live.',
    you: 'You', winner: 'Winner', rating: 'rating', none: 'No vote open right now', noneHint: 'You\'ll get a notification when one opens.',
    start: 'Start {type}', startEarly: 'Start early', progress: '{done}/{need} matches', endPoll: 'End poll & crown winner', keepOpen: 'Keep open', yesEnd: 'Yes, end it', waking: 'Waking the server up… this can take up to a minute.'
  },

  time: { now: 'now', min: '{n}m', hour: '{n}h', day: '{n}d' },

  errors: { network: 'Can\'t reach the server. Check your connection.', session: 'Please sign in again.' }
};

export type Dict = typeof en;
