// Cafeteria small-talk — Pinoy office edition.
//
// The cast is a Filipino office (see cast.ts), so an agent's coffee break is an
// excuse for Taglish chika: chismis, pasabog na chika, gay lingo, sweldo-day
// hope and merienda politics. Two kinds of line:
//   • solo  — one quip shown above a single agent at a break spot
//   • pair  — a two-beat exchange between two agents at the same table
//
// Lines are kept short so they fit the ThoughtBubble (≈MAX_WIDTH). Character
// keys match OfficeCharacterName; anyone without bespoke lines falls back to the
// shared GENERIC pool so the floor never feels empty. Keep it playful — teasing
// among friends, never punching down.

import type { OfficeCharacterName } from './cast';

/** Where an agent is lingering — picks a contextual line pool. */
export type BreakSpot = 'coffee' | 'vending' | 'snack' | 'table';

const pick = <T,>(arr: readonly T[], seed: number): T =>
  arr[((seed % arr.length) + arr.length) % arr.length];

// ─── solo lines, by spot ─────────────────────────────────────────────────────

const COFFEE: readonly string[] = [
  '3-in-1 ulit. walang choice.',
  'sino umubos ng kape?? amin-amin na',
  'pang-apat na tasa. para sa bayan.',
  'kape muna bago ka kausapin, ha',
  'mainit pa, parang chika ni Mars',
  'sino nag-uwi ng mug ko??',
];

const VENDING: readonly string[] = [
  'kinain ng makina ang bente ko',
  'B4… sana chicharon, Lord',
  'naipit. classic. ang drama.',
  'inaalog ko lang. dahan-dahan. with respect.',
  'emotional support na Chippy',
  'wala nang barya. petsa de peligro.',
];

const SNACK: readonly string[] = [
  'may pa-merienda si boss? sana all',
  'sino umubos ng pandesal??',
  'kaunting treat lang. deserve ko.',
  'kanino ’tong pancit? birthday ba?',
  'baon ko ’yan! may pangalan pa!',
  'second breakfast. diet starts Monday.',
];

const TABLE: readonly string[] = [
  'meeting na naman. pwede email na lang?',
  'limang minuto pa. promise.',
  'nabasa mo na yung GC? grabe.',
  'kunwari nagbabasa ng notes',
  'kailangan ko ’to. pagod na ang beshie mo',
  'wag mong sabihin kay Ramon nandito ako',
  'kinsenas na ba? tanong lang.',
  'na-traffic sa EDSA. dalawang oras. slay.',
];

const SPOT_POOL: Record<BreakSpot, readonly string[]> = {
  coffee: COFFEE, vending: VENDING, snack: SNACK, table: TABLE,
};

// ─── character flavour — overrides the generic pool when present ─────────────

const BY_CHARACTER: Partial<Record<OfficeCharacterName, readonly string[]>> = {
  michael:  ['team building sa Tagaytay, sino G?', 'ako na bahala sa merienda. charot.', 'walang meeting bago kape. rule yan.', 'family tayo dito. pero may deadline.'],
  dwight:   ['MALI.', 'bawal kumain sa desk. memo ’yan.', 'ang late ay late. kahit 8:01.', 'sino gumalaw ng stapler ko??', 'nakalista ka na sa notebook ko.'],
  jim:      ['nilagay ko ulit sa jelly ang stapler ni Rodel', 'andito lang ako para sa chika', 'prank lang, mars. prank lang.', '*tumingin sa camera*'],
  pam:      ['ATMT LAB, good morning! si Maricel po ito', 'dino-drawing ko yung vending machine', 'may bagong chika sa reception, ha'],
  kevin:    ['sino nagluto ng adobo? ako’y nagugutom', 'unli-rice ba ’to?', 'kanin pa. kanin pa. kanin pa.', 'merienda na ba? 10am pa lang? eh di brunch.'],
  angela:   ['ang dumi ng pantry. sino ’to?', 'Christmas party committee, 3pm. walang late.', 'hinuhusgahan ko yung ref.', 'resibo muna bago reimburse.'],
  oscar:    ['actually, "espresso" ’yan, hindi "expresso"', 'technically naman…', 'bongga ng budget sa snacks, ha. shonga.', 'keri lang, beshie.'],
  stanley:  ['sweldo day ba ngayon?', 'nautal ba ako?', 'crossword at kape. wag akong istorbohin.', 'tataya ako sa lotto mamaya.'],
  phyllis:  ['susunduin ako ni hubby ng alas-singko', 'may baon akong turon, gusto mo?', 'kumain ka na ba, anak?'],
  andy:     ['videoke mamaya? My Way ako.', 'kinanta ko na, 98 score!', 'Christmas party, ako ang host!'],
  kelly:    ['MARS. may PASABOG akong chika.', 'hindi ako chismosa, informed lang.', 'OMG, nakita mo yung jowa ni ano??', 'chika muna bago trabaho, ganern.'],
  ryan:     ['intern lang ako pero may crypto ako', 'nag-start ako ng coffee startup, actually', 'OJT hours ko, sulit ba?'],
  toby:     ['isusulat ko ’to sa incident report…', 'HR-wise, okay lang ang break na ’to', 'walang umuupo sa tabi ko. okay lang.'],
  creed:    ['sino ka ulit? bago ka ba?', 'may kilala ako diyan.', 'nakakain na ako ng mas malala sa ref na ’yan.'],
  meredith: ['alas-singko na ba? inuman na!', 'sino may pulutan?', 'Friday na! ay, Martes pa lang?'],
};

/** A solo break-room line. Character flavour ~60% of the time, else the line
 *  fits the spot the agent is standing at. `seed` keeps it deterministic per
 *  call site (avoids Math.random, which Pixi/Electron CSP-safe code prefers). */
export function pickSoloLine(character: OfficeCharacterName, spot: BreakSpot, seed: number): string {
  const flavour = BY_CHARACTER[character];
  if (flavour && seed % 5 < 3) return pick(flavour, Math.floor(seed / 5));
  return pick(SPOT_POOL[spot], seed);
}

// ─── paired exchanges (two agents at one table) ──────────────────────────────
//
// Each exchange is a list of beats that ALTERNATE between the two agents:
// beat[0] = the speaker who sat down, beat[1] = their table-mate, beat[2] =
// speaker again, and so on. The director plays them out one beat at a time.
// Lines are trimmed to fit the thought cloud; longer ones auto-truncate.

type Exchange = readonly string[];

// Chismis & chika — works between any two agents.
const CHISMIS_EXCHANGES: readonly Exchange[] = [
  ['Mars, may chika ako.', 'ano ’yan? spill.', 'wag kang maingay ha.', 'sino ako, si Kristine?'],
  ['PASABOG. sila na daw.', 'SINO?!', 'yung dalawa sa accounting.', 'sabi ko na nga ba!'],
  ['may bagong jowa si ano.', 'ang bilis!', 'last week lang break up nila.', 'moving on era.'],
  ['narinig mo? may resign.', 'sino?!', 'di ko sure. basta may resign.', 'ang chika mo, kulang sa facts.'],
  ['hindi ako chismosa, ha.', 'oo naman.', 'so eto na nga…', 'ayan na.'],
  ['bakit tahimik ka?', 'nag-iipon ako ng chika.', 'para kanino?', 'para sa GC.'],
  ['sino nag-reply all?', 'wag na natin pag-usapan.', 'si Jomar.', 'pinag-usapan mo pa rin.'],
  ['totoo ba yung chika?', 'alin dun?', 'lahat.', '…80 percent.'],
  ['may seen-zone ka?', 'araw-araw.', 'sino?', 'yung manager.'],
  ['huy, di ka na nagpaparamdam.', 'busy lang.', 'busy o may jowa?', 'bakit hindi pwede pareho?'],
  ['may pa-pancit sa 3rd floor!', 'kaninong birthday?', 'di ko alam.', 'happy birthday sa kanila.'],
];

// Gay lingo / bekimon banter — affectionate office slang, anyone can use it.
const LINGO_EXCHANGES: readonly Exchange[] = [
  ['bongga ng outfit mo today, Mars!', 'keri lang, ukay ’to.', 'ang ganda pa rin.', 'I know, charot!'],
  ['chaka ng deadline natin.', 'super chaka.', 'kaya pa ba?', 'keri natin ’to, beshie.'],
  ['shonga, mali yung file.', 'echos! tama ’yan.', 'v1 ’yan, may v7 na.', '…shonga nga ako.'],
  ['nakakaloka yung meeting kanina.', 'ang haba ng hair ni boss.', 'dahil sa feedback?', 'dahil sa sariling ideya niya.'],
  ['ang taray mo today, ha.', 'fierce lang, hindi mataray.', 'magkaiba ba ’yon?', 'depende sa lighting.'],
  ['Juding na Juding ang email mo.', 'ano ibig sabihin non?', 'pa-cute pero may pasabog.', 'ah, strategy ’yon.'],
  ['sis, jowable ba yung bagong hire?', 'focus sa work.', 'oo nga.', '…pero jowable nga.'],
  ['ganern talaga ang life, Mars.', 'ganern na ganern.', 'pero bakit?', 'kasi ganern.'],
  ['nag-diet ako, bes!', 'wow, bongga!', 'kanina umaga.', 'tapos na?', 'lunch na eh.'],
  ['keri ba ’tong design?', 'keri na keri!', 'sure ka?', 'charot. ulitin mo.'],
];

// Pinoy office life — sweldo, traffic, merienda, meetings.
const OFFICE_EXCHANGES: readonly Exchange[] = [
  ['kinsenas na ba?', 'bukas pa.', 'bakit ang tagal?', 'petsa de peligro, sis.'],
  ['sweldo na!', 'wala na agad.', 'bakit?', 'bills. Shopee. ambagan.'],
  ['ilang oras ka sa EDSA?', 'dalawa.', 'ako tatlo.', 'panalo ka na naman.'],
  ['brownout sa amin kagabi.', 'naka-save ka ba?', 'hindi.', 'isang minutong katahimikan.'],
  ['sino taya sa merienda?', 'ikaw, bagong sweldo ka.', 'libre kita…', 'talaga?', '…next year.'],
  ['meeting daw, 5pm.', 'Biyernes?!', 'Biyernes.', 'bakit ganito ang buhay.'],
  ['may OT daw tayo.', 'may pa-dinner?', 'wala.', 'eh di hindi ako OT.'],
  ['team building sa Tagaytay!', 'libre?', 'KKB.', 'may lagnat ako that day.'],
  ['exchange gift, 500 budget.', 'ang mahal!', 'wishlist mo?', 'tulog.'],
  ['green na ba yung build?', '…wag mo nang tignan.', 'pula?', 'mas pula pa sa bayong.'],
  ['standup inabot ng 40 minutes.', 'pwede namang email.', 'pwede namang GC.', 'pwede namang wala.'],
  ['nag-leave ka kahapon?', 'sick leave.', 'nakita kita sa mall.', 'doon ako gumaling.'],
  ['Monday na naman.', 'kakasimula lang ng weekend.', 'yun nga.', 'scam ang weekend.'],
  ['ang init sa office.', 'sira aircon.', 'kanina pa?', 'mula 2019.'],
  ['ano ulam mo?', 'adobo.', 'kahapon adobo rin.', 'adobo is life.'],
];

// ─── the running gag: "Charot!" / "Sana all" / hugot ────────────────────────
//
// The office's favourite bit. These are generic (added to the shared pool
// below) so ANY two agents at a table can run them: whoever sits down first
// delivers the innocent setup (beat 0) and their table-mate lands the punchline
// (beat 1) — a "sana all", a hugot, or a "charot" to take it all back.
const HUGOT_EXCHANGES: readonly Exchange[] = [
  ['may pa-bonus daw si boss.', 'sana all.'],
  ['sinundo siya ng jowa niya.', 'sana all.', 'may jowa ka naman ah.', 'sana all may jowang sumusundo.'],
  ['approved agad yung leave ko.', 'sana all.'],
  ['naka-work from home siya.', 'sana all.', 'bukas ikaw naman.', 'charot lang pala ’yan.'],
  ['pinaasa lang ako ng deadline.', 'hugot ka na naman.', 'hindi, deadline talaga.', 'sure, Mars.'],
  ['bakit ka nag-commit kung hindi mo kaya?', 'code ba ’yan o jowa?', 'code.', 'parehong masakit.'],
  ['sabi niya "last revision na ’to."', 'naniwala ka?', 'oo.', 'kaya ka nasasaktan.'],
  ['bakit parang ako lang nag-e-effort?', 'sa project?', 'sa lahat.', 'hugot level: expert.'],
  ['ang bilis mo mag-reply.', 'sa client lang.', 'sa akin?', 'seen lang. charot!'],
  ['ang galing ng presentation mo!', 'talaga?', 'oo!', 'charot.', 'MARS.'],
  ['libre kita ng milk tea.', 'omg thank you!', 'charot.', 'ang sakit mo.'],
  ['in-archive niya yung chat natin.', 'yung GC?', 'yung puso ko.', 'charot!', 'ay akala ko totoo.'],
  ['ang pogi ng bagong manager.', 'focus sa quarterly report.', 'focus nga ako.', 'sa manager.'],
  ['sana may nag-a-approve din sa akin.', 'PR mo?', 'buhay ko.', 'ang lalim, beshie.'],
  ['"okay lang ako," sabi ko sa standup.', 'okay ka ba?', 'hindi.', 'same.'],
  ['bakit mo ako i-mute?', 'meeting ’yon.', 'sa buhay mo?', 'charot, i-unmute na kita.'],
];

// Everything any table-mate pair can draw from.
const PAIR_POOL: readonly Exchange[] = [...CHISMIS_EXCHANGES, ...LINGO_EXCHANGES, ...OFFICE_EXCHANGES, ...HUGOT_EXCHANGES];

// Keyed off the SPEAKER so, when the right character sits down first, they get
// to open with their signature bit.
const KEYED_EXCHANGES: Partial<Record<OfficeCharacterName, Exchange>> = {
  michael:  ['family tayo dito, diba?', 'opo, boss.', 'kaya walang OT pay.', '…charot ba ’yan, boss?'],
  dwight:   ['MALI. 8:01 ka dumating.', 'isang minuto lang!', 'nakalista ka na.', 'grabe ka, Rodel.'],
  kevin:    ['may natirang kanin?', 'kakakain mo lang, Bong.', 'dessert ko ’yon.'],
  kelly:    ['okay wag kang ma-shock, pero—', 'na-shock na ako.', 'PASABOG ’to.', 'spill, Mars!'],
  oscar:    ['technically naman—', '…eto na naman tayo.', 'keri lang, makinig ka.'],
  angela:   ['ang dumi ng table na ’to.', 'pantry ’to, Rowena.', 'kaya nga dapat malinis.'],
  creed:    ['sino ka ulit?', '…magkatabi tayo ng desk.', 'ah, ikaw pala. may kilala ako diyan.'],
  stanley:  ['sweldo day ba?', 'hindi pa, Ernesto.', '…nautal ba ako?'],
  andy:     ['videoke mamaya?', 'ayoko na, My Way ka na naman.', 'para sa’yo ’to.'],
  jim:      ['tanong.', 'ano?', 'wala lang. chine-check lang kita.', 'charot ka talaga, Paolo.'],
  pam:      ['may chika sa reception.', 'ano?', 'may nagpadala ng bulaklak.', 'KANINO?!'],
  meredith: ['inuman mamaya?', 'Martes pa lang, Divina.', 'eh di Martes inuman.'],
};

/** A multi-beat exchange for two agents sharing a table. Beats alternate:
 *  index 0 = `speaker`, 1 = the table-mate, 2 = speaker, … */
export function pickExchange(speaker: OfficeCharacterName, seed: number): Exchange {
  const keyed = KEYED_EXCHANGES[speaker];
  if (keyed && seed % 4 === 0) return keyed;
  return pick(PAIR_POOL, seed);
}
