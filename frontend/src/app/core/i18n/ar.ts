import { Dict } from './en';

/** Arabic strings. Must have exactly the same keys as en.ts (TypeScript checks this). */
export const ar: Dict = {
  app: { name: 'The Handler', waking: 'جارٍ تشغيل السيرفر…', offline: 'أنت غير متصل بالإنترنت', retry: 'حاول مرة أخرى', loading: 'جارٍ التحميل…', save: 'حفظ', saved: 'تم الحفظ', cancel: 'إلغاء', close: 'إغلاق', back: 'رجوع', next: 'التالي', done: 'تم', delete: 'حذف', edit: 'تعديل', yes: 'نعم', no: 'لا', or: 'أو', optional: 'اختياري', copy: 'نسخ', copied: 'تم النسخ', share: 'مشاركة', error: 'حدث خطأ ما', confirm: 'هل أنت متأكد؟' },
  nav: { home: 'الرئيسية', matches: 'الماتشات', squad: 'اللاعبين', vote: 'التصويت', me: 'حسابي', organizer: 'المنظم' },
  pos: { GK: 'حارس مرمى', DEF: 'مدافع', MID: 'وسط', FWD: 'مهاجم', short_GK: 'حارس', short_DEF: 'دفاع', short_MID: 'وسط', short_FWD: 'هجوم' },
  attr: { pace: 'السرعة', attack: 'الهجوم', passing: 'التمرير', defence: 'الدفاع', physical: 'القوة البدنية', goalkeeping: 'حراسة المرمى', short_pace: 'سرعة', short_attack: 'هجوم', short_passing: 'تمرير', short_defence: 'دفاع', short_physical: 'قوة', short_goalkeeping: 'حراسة' },
  badge: { reliable: 'ملتزم', mvp: 'أفضل لاعب ×{n}', scorer: 'هدّاف', playmaker: 'صانع لعب', veteran: 'مخضرم', hot: 'في الفورمة' },
  card: { provisional: 'مبدئي', provisionalHint: 'لا توجد تقييمات كافية بعد', matches: 'ماتشات', goals: 'أهداف', assists: 'صناعة', wins: 'فوز', mvps: 'أفضل لاعب', form: 'آخر نتائج', formerPlayer: 'لاعب سابق' },

  auth: {
    googleAs: 'تم الدخول بجوجل: {email}', setupCode: 'رمز إعداد المنظم', setupCodeHint: 'الرمز ORGANIZER_SETUP_CODE المضبوط على السيرفر. غير مطلوب مع جوجل.',
    welcome: 'أهلاً بعودتك', signIn: 'تسجيل الدخول', signingIn: 'جارٍ الدخول…', email: 'البريد الإلكتروني', password: 'كلمة المرور', forgot: 'نسيت كلمة المرور؟',
    noAccount: 'ليس لديك حساب؟ اطلب رابط الدعوة من المنظم.', join: 'انضم إلى {group}', joinTitle: 'أنشئ لاعبك',
    invalidInvite: 'رابط الدعوة هذا لم يعد صالحاً. اطلب رابطاً جديداً من المنظم.', checkingInvite: 'جارٍ التحقق من الدعوة…',
    name: 'الاسم', phone: 'رقم الهاتف (واتساب)', position: 'مركزك', newPassword: 'كلمة المرور', passwordHint: '8 أحرف على الأقل، بها حرف ورقم',
    selfTitle: 'قيّم نفسك بصدق', selfHint: 'هذا مجرد بداية. يقل تأثيره بسرعة بمجرد أن يقيّمك زملاؤك، فلا فائدة من المبالغة.',
    consent: 'أوافق على مشاركة رقمي وبريدي مع المنظم فقط. باقي اللاعبين لن يروهما أبداً.',
    create: 'إنشاء الحساب', creating: 'جارٍ الإنشاء…', haveAccount: 'لديك حساب؟ سجّل الدخول',
    step1: 'الحساب', step2: 'اللاعب', step3: 'التقييم الذاتي',
    forgotTitle: 'إعادة تعيين كلمة المرور', forgotHint: 'سنرسل لك رمزاً من 6 أرقام على بريدك.', sendCode: 'أرسل الرمز', codeSent: 'إذا كان لهذا البريد حساب، فالرمز في الطريق.',
    code: 'الرمز (6 أرقام)', setPassword: 'تعيين كلمة مرور جديدة', resetDone: 'تم تغيير كلمة المرور. سجّل الدخول بها.', backToLogin: 'العودة لتسجيل الدخول'
  },

  home: {
    hello: 'أهلاً {name}', nextMatch: 'الماتش القادم', noMatch: 'لا يوجد ماتش محدد بعد', noMatchHint: 'سينشر المنظم الماتش القادم قريباً.',
    createMatch: 'إنشاء ماتش', in: 'أنا جاي', out: 'مش هقدر', maybe: 'يمكن', youreIn: 'أنت مشارك ✅', youreOut: 'أنت معتذر', youreMaybe: 'قلت يمكن',
    waitlist: 'أنت في قائمة الانتظار (#{n})', spots: '{n}/{cap} مؤكد', spotsLeft: 'باقي {n} أماكن', full: 'العدد مكتمل، الردود الجديدة تدخل قائمة الانتظار',
    seeTeams: 'شاهد الفرق', todo: 'مطلوب منك', rateTitle: 'قيّم {n} لاعبين من ماتش {place}', rateHint: 'حوالي 30 ثانية · بدون أسماء',
    pay: 'عليك {amount} لماتش {place}', disputes: '{n} طلبات مراجعة مواعيد', needResult: 'أدخل نتيجة ماتش {place}',
    pollOpen: 'تصويت لاعب الأسبوع مفتوح', kickoffIn: 'البداية بعد {t}', startedAgo: 'بدأ منذ {t}', allDone: 'لا يوجد شيء مطلوب'
  },

  match: {
    notifyTitle: 'أرسل تنبيهاً للمجموعة', notifyAsk: 'اسأل مين جاي', notifyAskHint: 'كل من لم يرد بعد', notifySoon: 'الماتش قرب', notifySoonHint: 'اللاعبين المؤكدين', notifyMessage: 'أرسل رسالة', notifyMessageHint: 'كل من في الماتش', notifyDetails: 'أرسل التفاصيل بالبريد', notifyDetailsHint: 'كل من في الماتش يصله المكان والموعد والخريطة والفرق', quickAdd: 'المفضلون · اضغط للإضافة كـ "جاي"', notifyPlaceholder: 'رسالتك…', notifySend: 'إرسال', notifySent: 'تم الإرسال إلى {n} أشخاص', notifyLast: 'آخر إرسال منذ {t}', notifyHow: 'يصل كإشعار على الهاتف وكبريد إلكتروني.', notifyWhatsapp: 'انشر في جروب الواتساب', seen: 'شاف', notSeen: 'لم يشاهد', noReplyTitle: 'لم يرد بعد',
    upcoming: 'القادمة', past: 'السابقة', newMatch: 'ماتش جديد', place: 'المكان', mapLink: 'رابط الخريطة', date: 'التاريخ', time: 'موعد البداية', capacity: 'عدد اللاعبين', price: 'السعر للفرد',
    create: 'إنشاء الماتش', creating: 'جارٍ الإنشاء…', created: 'تم إنشاء الماتش وإبلاغ الجميع.', none: 'لا توجد ماتشات هنا بعد', cancelled: 'ملغي', completed: 'انتهى',
    repeatWeekly: 'كرّر كل أسبوع', repeatHint: 'ماتش الأسبوع القادم يُنشأ تلقائياً عند بداية الماتش: نفس المكان واليوم والموعد.', repeats: 'أسبوعي', addToCalendar: 'أضف للتقويم', directions: 'الاتجاهات', shareInvite: 'شارك على واتساب', confirmed: 'مؤكد', waitlist: 'الانتظار', maybe: 'يمكن', out: 'معتذر', noReply: 'لم يرد بعد',
    tabPlayers: 'اللاعبين', tabTeams: 'الفرق', tabCheckin: 'الحضور', tabResult: 'النتيجة', tabMoney: 'الفلوس',
    setStatus: 'حدد رد لاعب', addPlayer: 'أضف لاعباً', remove: 'إزالة',
    makeTeams: 'قسّم الفرق', remake: 'اقترح من جديد', option: 'اقتراح {n}', balance: 'التوازن {n}%', prefs: 'تحقق {met} من {total} رغبات', noPrefs: 'لا توجد رغبات',
    publish: 'انشر الفرق', published: 'الفرق منشورة', unpublished: 'مسودة، أنت فقط تراها', saveDraft: 'احفظ كمسودة', shareTeams: 'شارك الفرق', teamsHidden: 'لم تُنشر الفرق بعد',
    tapToSwap: 'اضغط على لاعب ثم على آخر لتبديلهما', bench: 'خارج الفرق', needConfirmed: 'يلزم لاعبان مؤكدان على الأقل',
    teamA: 'الفريق أ', teamB: 'الفريق ب', strength: 'متوسط {n}',
    arrived: 'وصل', noShow: 'لم يحضر', late: 'متأخر {n} دقيقة', onTime: 'في الموعد', undo: 'تراجع', checkinHint: 'اضغط "وصل" عند وصول كل لاعب. الوقت يُسجّل تلقائياً.',
    score: 'النتيجة', scorers: 'الأهداف والصناعة', saveResult: 'احفظ النتيجة', resultSaved: 'تم حفظ النتيجة وبدأت جولة التقييم.', editResult: 'عدّل النتيجة',
    paid: 'دفع', unpaid: 'لم يدفع', totalPaid: 'دفع {paid} من {total}',
    rateNow: 'قيّم زملاءك', ratedThanks: 'شكراً على التقييم!', ratingProgress: 'قيّم {done} من {total}', closeRatings: 'أغلق التقييم الآن', ratingsClosed: 'التقييم مغلق',
    mvp: 'أفضل لاعب', youWereLate: 'تم تسجيلك متأخراً {n} دقيقة', youNoShow: 'تم تسجيلك غائباً', disputeSent: 'تم إرسال الطلب للمنظم',
    cancelMatch: 'إلغاء الماتش', deleteMatch: 'حذف الماتش', deleteConfirm: 'حذف هذا الماتش للجميع؟ لا يمكن التراجع.', cancelConfirm: 'إلغاء هذا الماتش؟ سيتم إبلاغ اللاعبين المؤكدين.',
    weather: '{temp}° · {desc}', vs: 'ضد', yourPayment: 'نصيبك: {amount}'
  },

  rate: {
    title: 'قيّم زملاءك', intro: 'قيّم {n} لاعبين من ماتش {place}. لن يرى أحد إجاباتك، ولا حتى المنظم.',
    playAgain: 'هل تحب اللعب معه مرة أخرى؟', gkOptional: 'شفته في المرمى؟', mvpTitle: 'من أفضل لاعب في الماتش؟', mvpSkip: 'تخطَّ التصويت',
    submit: 'أرسل التقييم', sending: 'جارٍ الإرسال…', done: 'تم! التقييمات بدون أسماء وتظهر عند إغلاق الجولة.', closed: 'التقييم لهذا الماتش مغلق.', already: 'لقد قيّمت هذا الماتش بالفعل.',
    scale: { '1': 'ضعيف', '2': 'أقل من المتوسط', '3': 'متوسط', '4': 'جيد', '5': 'ممتاز' }, step: '{i} من {n}'
  },

  squad: { title: 'اللاعبين', search: 'ابحث عن لاعب', all: 'الكل', sortOverall: 'التقييم', sortGoals: 'الأهداف', sortName: 'الاسم', empty: 'لا يوجد لاعبون', recent: 'آخر الماتشات', noRecent: 'لا توجد ماتشات بعد' },

  me: {
    emails: 'البريد الإلكتروني', emailsHint: 'التحديثات المهمة على البريد أيضاً', setPassword: 'أضف كلمة مرور', deleteConfirmEmail: 'اكتب بريدك لحذف حسابك',
    title: 'حسابي', ratingHow: 'كيف يُحسب تقييمك', fromSelf: 'تقييمك لنفسك', fromPeers: 'زملاؤك ({n} أشخاص)', fromResults: 'النتائج', peersPending: 'يظهر بعد أن يقيّمك 4 أشخاص مختلفين',
    adjustment: 'تعديل المنظم: {n}', punctuality: 'الالتزام بالمواعيد', onTimeOf: 'في الموعد {a} من آخر {b}', lateDrops: '{n} اعتذارات متأخرة', noRecord: 'لا يوجد تسجيل حضور بعد',
    dispute: 'هذا خطأ', disputeNote: 'ماذا حدث؟', sendDispute: 'أرسل للمنظم', pending: 'في انتظار المنظم', accepted: 'تم التصحيح ✅', rejected: 'أبقاه المنظم',
    prefsTitle: 'مع من تلعب', prefsPrivate: 'سري تماماً. يستخدمه مقسّم الفرق فقط؛ لا أحد يرى اختياراتك، ولا حتى المنظم.',
    playWith: 'أحب اللعب معهم (حتى {n})', avoid: 'أفضّل ألا أكون معهم (حتى {n})', pick: 'اختر', prefsSaved: 'تم الحفظ بسرية',
    profile: 'الملف الشخصي', photo: 'غيّر الصورة', uploading: 'جارٍ الرفع…', selfRating: 'التقييم الذاتي',
    app: 'التطبيق', language: 'اللغة', theme: 'المظهر', dark: 'داكن', light: 'فاتح', notifications: 'الإشعارات', notifOn: 'مفعّلة', notifOff: 'متوقفة', notifBlocked: 'محظورة من إعدادات المتصفح', notifUnsupported: 'ثبّت التطبيق لتصلك الإشعارات', install: 'ثبّت التطبيق',
    installHint: 'على الآيفون: مشاركة ← إضافة إلى الشاشة الرئيسية. على أندرويد: القائمة ← تثبيت التطبيق.',
    account: 'الحساب', changePassword: 'غيّر كلمة المرور', currentPassword: 'كلمة المرور الحالية', feedback: 'أرسل ملاحظة للمنظم', feedbackSent: 'شكراً! تم الإرسال.', logout: 'تسجيل الخروج',
    deleteAccount: 'احذف حسابي', deleteHint: 'يحذف حسابك وصورتك وتقييماتك واختياراتك. نتائج الماتشات السابقة تبقى باسم "لاعب سابق". لا يمكن التراجع.', deleteConfirm: 'اكتب كلمة المرور لحذف حسابك'
  },

  org: {
    usage: 'استخدام التطبيق', usageHint: 'آخر {n} ماتشات. أرقام فقط، بدون إجابات أي شخص.', active7: 'نشط هذا الأسبوع', active30: 'نشط هذا الشهر', pushOn: 'الإشعارات مفعّلة', replyRate: 'الرد على الماتشات', seenRate: 'فتح صفحة الماتش', ratingRate: 'إكمال التقييم', pollTurnout: 'التصويت', lastSeen: 'نشط منذ {t}', neverSeen: 'لم يدخل بعد', repliedOf: 'رد على {a} من آخر {b} ماتشات', google: 'جوجل',
    title: 'المنظم', invite: 'رابط الدعوة', inviteHint: 'أي شخص معه هذا الرابط يمكنه الانضمام. غيّره لو انتشر.', resetInvite: 'غيّر الرابط', resetConfirm: 'الرابط القديم سيتوقف عن العمل. متابعة؟',
    inviteMessage: 'انضم لمجموعة الخماسي: {link}',
    settings: 'إعدادات المجموعة', groupName: 'اسم المجموعة', grace: 'دقائق السماح قبل اعتبار اللاعب متأخراً', defaultCapacity: 'عدد اللاعبين الافتراضي', defaultPrice: 'السعر الافتراضي للفرد', currency: 'العملة', ratingWindow: 'مدة جولة التقييم (ساعات)',
    requests: 'طلبات مراجعة المواعيد', noRequests: 'لا توجد طلبات', accept: 'قبول', reject: 'رفض',
    unpaid: 'من عليه فلوس', noUnpaid: 'الجميع دفع', members: 'الأعضاء ({n})', concern: 'عدد من اللاعبين لا يستمتعون باللعب مع هذا اللاعب',
    adjust: 'تعديل التقييم', adjustHint: 'تصحيح بسيط حتى 5 نقاط بالزيادة أو النقص. يتلاشى خلال 5 ماتشات. اللاعب يرى الرقم فقط وليس السبب.',
    reason: 'السبب', reasons: { injury_return: 'عائد من إصابة', new_player: 'جديد ولم تلحق به التقييمات', plays_differently: 'مستواه مختلف عما تظهره التقييمات' },
    history: 'السجل', removeMember: 'أزله من المجموعة', removeConfirm: 'إزالة {name}؟ سيتم حذف حسابه وتقييماته.', call: 'اتصال', whatsapp: 'واتساب', noPhone: 'لم يشارك رقمه',
    feedback: 'الملاحظات', noFeedback: 'لا توجد ملاحظات', autoReminders: 'تذكيرات تلقائية', autoRemindersHint: 'يصل تذكير للجميع قبل الماتش بيوم، وللاعبين المؤكدين قبل البداية بحوالي ساعتين.', addFavorite: 'أضف للمفضلين', removeFavorite: 'أزل من المفضلين'
  },

  poll: {
    title: 'التصويت', subtitle: 'صوّت لأفضل اللاعبين. مرة واحدة في كل تصويت.', live: 'مباشر', closed: 'مغلق', weekly: 'لاعب الأسبوع', monthly: 'لاعب الشهر', team: 'فريق الأسبوع',
    votes: '{n} أصوات', tapThenConfirm: 'اضغط على لاعب ثم أكّد', yourPick: 'اختيارك', confirmVote: 'أكّد صوتك', voted: 'تم تسجيل صوتك. النتائج تتحدث مباشرة.',
    you: 'أنت', winner: 'الفائز', rating: 'تقييم', none: 'لا يوجد تصويت مفتوح الآن', noneHint: 'سيصلك إشعار عند فتح تصويت.',
    start: 'ابدأ {type}', startEarly: 'ابدأ مبكراً', progress: '{done}/{need} ماتشات', pickUpTo: 'اختر حتى {n} لاعبين ثم أكّد', pickedCount: 'اخترت {n} من {max}', congrats: 'مبروك يا {name}!', congratsSub: 'اختارك زملاؤك {title}', shareCard: 'شارك البطاقة', congratsText: '🏆 {name} هو {title}! ألف مبروك 👏', teamText: '⭐ {title}: {names}. ألف مبروك 👏', endPoll: 'أنهِ التصويت وتوّج الفائز', keepOpen: 'اتركه مفتوحاً', yesEnd: 'نعم، أنهِه', waking: 'جارٍ تشغيل السيرفر… قد يستغرق دقيقة.'
  },

  time: { now: 'الآن', min: '{n} د', hour: '{n} س', day: '{n} يوم' },

  errors: { network: 'تعذر الوصول للسيرفر. تحقق من الاتصال.', session: 'من فضلك سجّل الدخول مرة أخرى.' }
};
