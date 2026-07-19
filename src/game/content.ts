// FREEDOM DYNAMICS — content: production lines, hires, adversary, chyron copy.
// All balance knobs live in BALANCE so tuning happens in one place.

export interface LineDef {
  id: string;
  name: string;
  desc: string;            // flavor one-liner shown in the drawer
  unitName: string;        // what marches onto the field
  unitPlural: string;
  baseCost: number;        // cost of the first purchase
  growth: number;          // cost growth per unit owned
  batchTime: number;       // seconds per delivery batch at 1x speed
  revenue: number;         // $ per unit delivered
  power: number;           // battlefield power per unit
  hire: HireDef;
}

export interface HireDef {
  name: string;
  title: string;
  bio: string;
  cost: number;
}

export const LINES: LineDef[] = [
  {
    id: 'rifles',
    name: 'Surplus Rifle Refurbishment',
    desc: 'Vintage 1962. Certified pre-owned. Some bayonet damage (from us, earlier).',
    unitName: 'Rifle Squad', unitPlural: 'Rifle Squads',
    baseCost: 4, growth: 1.07, batchTime: 0.6, revenue: 1, power: 1,
    hire: {
      name: 'Gary', title: 'Retired Supply Sergeant',
      bio: 'Smells like gun oil and grievances. Counts everything twice, trusts nothing once.',
      cost: 1000
    }
  },
  {
    id: 'trucks',
    name: 'Tactical Truck Reupholstering',
    desc: 'The seats are now "combat leather". This adds $1.4M per vehicle.',
    unitName: 'Armored Truck', unitPlural: 'Armored Trucks',
    baseCost: 60, growth: 1.15, batchTime: 3, revenue: 60, power: 6,
    hire: {
      name: 'Tanner', title: "Congressman's Nephew",
      bio: 'Qualifications: nephew. Currently on his third "gap year" and your payroll.',
      cost: 15_000
    }
  },
  {
    id: 'drones',
    name: 'Attritable Drone Assembly',
    desc: '"Attritable" is defense-speak for "we get paid again when it explodes."',
    unitName: 'Drone Swarm', unitPlural: 'Drone Swarms',
    baseCost: 720, growth: 1.14, batchTime: 6, revenue: 540, power: 25,
    hire: {
      name: 'DroneLord_420', title: 'Defense Influencer',
      bio: 'Monetizing attrition across six platforms. His unboxings are classified.',
      cost: 180_000
    }
  },
  {
    id: 'tanks',
    name: 'Main Battle Tank Plant',
    desc: 'Block IV adds cupholders. Block V adds a second cupholder. Congress is thrilled.',
    unitName: 'Battle Tank', unitPlural: 'Battle Tanks',
    baseCost: 8_640, growth: 1.13, batchTime: 12, revenue: 4_320, power: 100,
    hire: {
      name: 'Gen. Hardline (Ret.)', title: 'Board Member, 4 Stars',
      bio: 'Retired Tuesday. Joined the board Wednesday. Recused himself from nothing.',
      cost: 2_100_000
    }
  },
  {
    id: 'howitzers',
    name: 'Freedom Howitzer Works',
    desc: 'Flagship product: "Diplomacy" — a 155mm conversation starter.',
    unitName: 'Howitzer Battery', unitPlural: 'Howitzer Batteries',
    baseCost: 103_680, growth: 1.12, batchTime: 24, revenue: 51_840, power: 400,
    hire: {
      name: 'Bunny Vanderclay', title: 'Lobbyist Emeritus',
      bio: 'Knows a guy. Knows all the guys. Is legally several of the guys.',
      cost: 26_000_000
    }
  },
  {
    id: 'jets',
    name: 'Fifth-Generation-ish Fighter Program',
    desc: 'Only $1.7 trillion over budget, which is under budget for us.',
    unitName: 'Strike Fighter', unitPlural: 'Strike Fighters',
    baseCost: 1_244_160, growth: 1.11, batchTime: 96, revenue: 622_080, power: 1_600,
    hire: {
      name: 'Deborah', title: 'Program Manager (Unkillable)',
      bio: 'Has survived 14 cancellations, 9 audits, and one sincere attempt to understand the budget.',
      cost: 310_000_000
    }
  },
  {
    id: 'hypersonic',
    name: 'Hypersonic Something™',
    desc: 'Nobody knows what it is. It is, however, hypersonic.',
    unitName: 'Hypersonic Asset', unitPlural: 'Hypersonic Assets',
    baseCost: 14_929_920, growth: 1.10, batchTime: 384, revenue: 7_464_960, power: 6_400,
    hire: {
      name: 'C.O.M.P.L.Y.', title: 'Compliance AI',
      bio: 'Approves everything instantly. Has never once been asked a follow-up question.',
      cost: 3_700_000_000
    }
  },
  {
    id: 'orbital',
    name: 'Orbital [REDACTED]',
    desc: '█████ ███ ██████ from space. Invoice attached.',
    unitName: '[REDACTED]', unitPlural: '[REDACTED]',
    baseCost: 179_159_040, growth: 1.09, batchTime: 1536, revenue: 89_579_520, power: 25_600,
    hire: {
      name: '██████', title: 'From The Agency',
      bio: "You didn't hire them. They arrived. HR has agreed not to ask.",
      cost: 45_000_000_000
    }
  }
];

// Owned-count milestones: each reached threshold doubles that line's production speed.
export const MILESTONES = [10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];

// ————— Theater sectors —————
// Progression is territorial: the front pushes through an endless chain of
// named sectors. Beating a sector annexes it, pays a bond, and rolls the fog
// back off the next stretch of map.

const SECTOR_ADJ = ['Copper', 'Rust', 'Bleak', 'Powder', 'Glass', 'Static', 'Iron', 'Cinder', 'Mirror', 'Grim', 'Hollow', 'Broken', 'Silent', 'Red', 'Dust', 'Granite'];
const SECTOR_NOUN = ['Gulch', 'Flats', 'Ridge', 'Basin', 'Valley', 'Fork', 'Pass', 'Hills', 'Barrens', 'Crossing', 'Steppe', 'Reach', 'Hollows', 'Plateau', 'Marsh', 'Divide'];
const SECTOR_TYPE = ['', '', '', ' Refinery', ' Junction', ' Depot', ' Exclusion Zone', ' Testing Range', ' Logistics Hub', ' Tax Haven'];

const RENAME_SUFFIX = ['ville', 'burg', ' Heights', ' Landing', ' Falls', ' Estates™', ' Freehold', ' Campus', ' Annex', ' Gardens'];

function seededPick<T>(arr: T[], seed: number): T {
  // Deterministic pick so sector names are stable across sessions.
  const h = Math.abs(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)) % arr.length;
  return arr[h];
}

export function sectorName(index: number, fiscalYear: number): string {
  const s = index * 31 + fiscalYear * 977;
  return `${seededPick(SECTOR_ADJ, s)} ${seededPick(SECTOR_NOUN, s + 7)}${seededPick(SECTOR_TYPE, s + 13)}`;
}

export function capturedName(company: string, index: number): string {
  const brand = (company.split(' ')[0] || 'Freedom');
  return `${brand}${RENAME_SUFFIX[index % RENAME_SUFFIX.length]}`;
}

export const BALANCE = {
  // Adversary strength defending sector s = ADV_BASE * ADV_GROWTH^s
  ADV_BASE: 22,
  ADV_GROWTH: 1.31,
  // Theater geometry: world-units of map per sector along the advance axis,
  // and how many sectors of map are visible past the front before the fog.
  SECTOR_SPACING: 26,
  REVEAL_AHEAD: 1.35,
  // Front line movement per second = FRONT_K * (forceRatio - 1), see battle.ts
  FRONT_K: 0.004,
  FRONT_RETREAT_SCALE: 0.5,   // retreat is slower than advance (you never quite collapse)
  FRONT_FLOOR: 0.05,
  FRONT_START: 0.15,
  // Attrition: your standing army loses ADV_DPS_FRAC*A + SELF_ATTRITION*P power/sec
  ADV_DPS_FRAC: 0.03,
  SELF_ATTRITION: 0.005,
  // Annexing sector s pays a war-bond bonus of BOND_MULT * A(s) dollars
  BOND_MULT: 18,
  // Prestige: lobbying power earned = LP_RATE * sqrt(lifetimeEarnings / LP_SCALE)
  LP_RATE: 1,
  LP_SCALE: 5e7,
  LP_REVENUE_BONUS: 0.02,     // each LP: +2% revenue
  LP_POWER_BONUS: 0.02,       // each LP: +2% unit power
  PRESTIGE_MIN_SECTOR: 8,
  OFFLINE_CAP_HOURS: 72,
  TICK: 0.25                  // sim timestep, seconds
};

// The Adversary's rebrand rotation — one per sector, cycling with escalating menace.
export const ADVERSARY_NAMES = [
  'The Adversary', 'The Near-Peer Threat', 'Anomalous Belligerents',
  'The Non-Allied Entity', 'Gray-Zone Actors', 'The Pacing Challenge',
  'Unattributed Forces', 'The Competitor (Kinetic)', 'Peer-Adjacent Aggressors',
  'The Situation', 'Emergent Hostiles', 'The Other Guys',
  'Strategic Weather', 'The Unpleasantness', 'Assertive Non-Customers',
  'The Threat Formerly Known As [REDACTED]', 'Malign Influencers',
  'The Backorder of Evil', 'Contested Environment Enjoyers', 'Q4 Headwinds'
];

export function adversaryName(sector: number): string {
  return ADVERSARY_NAMES[((sector % ADVERSARY_NAMES.length) + ADVERSARY_NAMES.length) % ADVERSARY_NAMES.length];
}

// ————— Chyron copy —————
// Static pool, shuffled between reactive headlines.
export const CHYRON_STATIC = [
  'WAR GOING GREAT, SAY WAR PROFITEERS',
  'PENTAGON FAILS 7TH AUDIT; MORALE "EXCELLENT"',
  'STUDY: EXPLOSIONS UP 400%, ECONOMISTS CELEBRATE',
  'ADVERSARY DENIES EXISTING; STRIKES CONTINUE',
  'CONGRESS APPROVES BUDGET NOBODY READ, AGAIN',
  'LOCAL CONTRACTOR NAMED "MOST ESSENTIAL" BY ITSELF',
  'PEACE TALKS POSTPONED — SCHEDULING CONFLICT WITH WAR',
  'ANALYSTS: CONFLICT HAS "STRONG FUNDAMENTALS"',
  'DOD ORDERS 10,000 MORE OF WHATEVER THAT WAS',
  'THINK TANK THINKS TANKS: REPORT',
  'HEARING ON SPENDING ENDS EARLY; RAN OUT OF MONEY',
  'RECRUITMENT AD WINS OSCAR FOR BEST SHORT FILM',
  'ADVERSARY REBRANDS AGAIN; MARKETING BLAMED',
  'ETHICS OFFICE RELOCATED TO SMALLER, QUIETER BUILDING',
  'MISSILE NAMED "PEACEKEEPER II"; IRONY OFFICE SILENT',
  '$640 HAMMER VINDICATED BY HISTORY, SAYS HAMMER LOBBY',
  'WAR ENTERS DAY [WHATEVER]; SPONSORS REMAIN CONFIDENT',
  'GENERAL JOINS BOARD OF COMPANY HE PROCURED FROM; COINCIDENCE',
  'NEW STEALTH PROGRAM SO SECRET IT MAY NOT EXIST',
  'FACT CHECK: THE EXPLOSIONS ARE REAL',
  'DEFENSE STOCKS RALLY ON NEWS OF NEWS',
  'ADVERSARY CAUGHT USING OUR OLD EQUIPMENT; SALES TEAM PROUD',
  'OVERSIGHT COMMITTEE OVERSLEPT',
  'INVISIBLE JET UNVEILED AT CEREMONY; PODIUM EMPTY',
  'SURVEY: 9 OUT OF 10 CONTRACTORS RECOMMEND MORE CONTRACTORS'
];

// Reactive templates. {X} placeholders are filled by the chyron system.
export const CHYRON_REACTIVE = {
  buy: [
    '{COMPANY} ACQUIRES {N}TH {UNIT}; ADVERSARY "CONCERNED"',
    'BREAKING: {COMPANY} NOW OWNS {N} {UNITS}',
    '{UNITS} STOCKPILE HITS {N}; NEIGHBORS COMPLAIN ABOUT NOISE'
  ],
  hire: [
    '{COMPANY} HIRES {HIRE}; ETHICS OFFICE "LOOKING INTO IT"',
    '{HIRE} JOINS {COMPANY}; DENIES EVERYTHING PREEMPTIVELY'
  ],
  territoryWon: [
    '{SECTOR} ANNEXED; {ADVERSARY} REGROUPING',
    '{SECTOR} FALLS; PARADE BUDGET EXCEEDS BATTLE BUDGET',
    '{SECTOR} LIBERATED INTO RECEIVERSHIP; LOCALS "PROCESSING"',
    '{SECTOR} NOW {RENAMED}; SIGNAGE CONTRACT AWARDED (NO-BID)',
    'RENT COLLECTION BEGINS IN {SECTOR}; TANKS DOUBLE AS NOTICES'
  ],
  waveStarted: [
    '{NATION} LAUNCHES FINAL OFFENSIVE; ANALYSTS CALL IT "A STRONG EXIT"',
    'EVERYTHING {NATION} HAS LEFT IS NOW MOVING TOWARD YOU',
    '{NATION} GOES ALL-IN; BOARD ROOM ORDERS POPCORN'
  ],
  nationFell: [
    '{NATION} ACQUIRED; INTEGRATION SYNERGIES "KINETIC"',
    '{NATION} CEASES TO EXIST; SHAREHOLDERS NOTIFIED BY POSTCARD',
    'FLAG OF {NATION} RETIRED TO GIFT SHOP'
  ],
  milestone: [
    '{LINE} DOUBLES OUTPUT; WORKERS PROMISED PIZZA',
    '{LINE} HITS PRODUCTION MILESTONE; BELL RUNG, BELL INVOICED'
  ],
  prestige: [
    'FISCAL YEAR ENDS: WAR WON, REBRANDED, RESCHEDULED',
    '{COMPANY} RESTRUCTURES; SAME PEOPLE, NEW LANYARDS'
  ]
};

// Company name generator for the founding ceremony.
export const COMPANY_PREFIX = ['Freedom', 'Liberty', 'Patriot', 'Eagle', 'Apex', 'Vigilant', 'Sovereign', 'Allied', 'Universal', 'Dynamic', 'Reliant', 'Summit'];
export const COMPANY_CORE = ['Dynamics', 'Defense', 'Aerospace', 'Ballistics', 'Solutions', 'Systems', 'Industries', 'Ordnance', 'Applications', 'Logistics', 'Integrations', 'Deterrence'];
export const COMPANY_SUFFIX = ['LLC', 'Inc.', 'Group', 'Consortium', '& Sons', 'Worldwide', 'International', 'Holdings', 'Unlimited', '(Delaware)', 'PLC', 'Joint Venture'];

export function randomCompanyName(rand: () => number = Math.random): string {
  const p = COMPANY_PREFIX[Math.floor(rand() * COMPANY_PREFIX.length)];
  const c = COMPANY_CORE[Math.floor(rand() * COMPANY_CORE.length)];
  const s = COMPANY_SUFFIX[Math.floor(rand() * COMPANY_SUFFIX.length)];
  return `${p} ${c} ${s}`;
}

// After-action report euphemisms for units lost.
export const AAR_EUPHEMISMS = [
  'assets un-alived', 'inventory kinetically depreciated', 'units promoted to debris',
  'hardware achieving terminal ROI', 'products field-tested to completion',
  'deliverables delivered (permanently)', 'warranty events'
];

export const AAR_COMMENDATIONS = [
  'Certificate of Sustained Invoicing',
  'Medal of Continuous Delivery',
  'Order of the Golden Cost-Plus',
  'Distinguished Cross of Plausible Deniability',
  'Ribbon of Excellence in Explosions',
  'The Auditor Evasion Star (with clusters)'
];
