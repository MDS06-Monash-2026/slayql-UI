// Project credits and interview quotes for the landing page.
//
// Entries marked `placeholder: true` are shown in development (labelled "Placeholder") so the
// layout can be reviewed, and are hidden on the live site. Replace the text and remove the flag
// once the real content is confirmed; only quote people who agreed to be quoted.

export const PROJECT = {
  institution: 'Monash University Malaysia',
  programme: 'Final Year Project 2026',
  team: 'MDS06',
  researchRepo: 'https://github.com/MDS06-Monash-2026/C-CaSE',
  // The research repository is private for now (GitHub answers 404 to visitors). Set to true once it is public.
  researchRepoPublic: false,
  appRepo: 'https://github.com/MDS06-Monash-2026/slayql-UI',
  supervisor: { name: 'Dr Soon (full name to confirm)', role: 'Supervisor', placeholder: true },
  // The team list is shown only once every member is filled in.
  members: [
    { name: 'Kian Lok', role: 'Team member' },
    { name: 'Team member 2', role: 'Role', placeholder: true },
    { name: 'Team member 3', role: 'Role', placeholder: true },
    { name: 'Team member 4', role: 'Role', placeholder: true },
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

// Live site: hide placeholders. Development: show them, labelled.
export const showPlaceholders = !import.meta.env.PROD;
export const visible = (items) => items.filter((item) => showPlaceholders || !item.placeholder);
