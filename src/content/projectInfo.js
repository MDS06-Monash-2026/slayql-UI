// Project credits and interview quotes for the landing page.
//
// Entries marked `placeholder: true` are shown in development (labelled "Placeholder") so the
// layout can be reviewed, and are hidden on the live site. Replace the text and remove the flag
// once the real content is confirmed; only quote people who agreed to be quoted.

// Display name of the schema-linking research (formerly C-CaSE; the repository keeps its old name).
export const RESEARCH_NAME = 'SlayQL Link';

export const PROJECT = {
  institution: 'Monash University Malaysia',
  programme: 'Final Year Project 2026',
  team: 'MDS06',
  researchRepo: 'https://github.com/MDS06-Monash-2026/C-CaSE',
  // The research repository is private for now (GitHub answers 404 to visitors). Set to true once it is public.
  researchRepoPublic: false,
  appRepo: 'https://github.com/MDS06-Monash-2026/slayql-UI',
  supervisors: [
    { name: 'Dr. Soon Lay Ki', role: 'Supervisor' },
    { name: 'Tazeek Bin Abdur Rakib', role: 'Supervisor' },
  ],
  members: [
    { name: 'Kian Lok Chin', role: 'Team lead' },
    { name: 'Lim Chi Jian', role: 'Team member' },
    { name: 'Ooi Hui Xia', role: 'Team member' },
    { name: 'Lim Ding Cong', role: 'Team member' },
  ],
};

// From the customer conversations (docs/CUSTOMER_CONVERSATIONS.md). Anonymised: role, industry, state.
export const VOICES = [
  {
    quote: 'Placeholder: a quote about waiting for figures or a wrong number in a meeting.',
    who: 'Finance executive, distributor, Selangor',
    placeholder: true,
  },
  {
    quote: 'Placeholder: a quote about the weekly pack or what they would pay for it.',
    who: 'Owner, wholesaler, Penang',
    placeholder: true,
  },
];

// Headline numbers from the customer conversations (summary template in docs/CUSTOMER_CONVERSATIONS.md).
// Replace each value with the real tally and remove `placeholder`; until then they show only in development.
export const FIELD_STATS = [
  { value: 'N', label: 'conversations', placeholder: true },
  { value: '_ h', label: 'hours a week on figures', placeholder: true },
  { value: '_ of N', label: 'had a wrong-number story', placeholder: true },
  { value: '_ of N', label: 'would try it', placeholder: true },
];

// Live site: hide placeholders. Development: show them, labelled.
export const showPlaceholders = !import.meta.env.PROD;
export const visible = (items) => items.filter((item) => showPlaceholders || !item.placeholder);
