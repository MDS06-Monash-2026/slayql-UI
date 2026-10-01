import React from 'react';
import { Quote } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { FIELD_STATS, PROJECT, RESEARCH_NAME, VOICES, showPlaceholders, visible } from '../../content/projectInfo';

function PlaceholderTag({ show }) {
  return show ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Placeholder</span> : null;
}

// Interview quotes: only rendered once at least one real (non-placeholder) quote exists on the live site.
export function VoicesSection() {
  const quotes = visible(VOICES);
  const stats = visible(FIELD_STATS);
  if (!quotes.length && !stats.length) return null;
  return (
    <section id="voices" className="border-t border-slate-200 bg-white py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-950">From our conversations with finance teams</h2>
        {stats.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-6 text-center lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-semibold tracking-tight text-slate-950">{stat.value}</p>
                <p className="mt-1 text-sm text-slate-600">{stat.label}<PlaceholderTag show={stat.placeholder} /></p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {quotes.map((voice) => (
            <figure key={voice.quote} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <Quote className="h-5 w-5 text-indigo-300" aria-hidden="true" />
              <blockquote className="mt-2 text-lg text-slate-800">{voice.quote}</blockquote>
              <figcaption className="mt-3 text-sm text-slate-500">{voice.who}<PlaceholderTag show={voice.placeholder} /></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ProjectSection() {
  const supervisors = visible(PROJECT.supervisors);
  const members = visible(PROJECT.members);

  return (
    <section id="about" className="border-t border-slate-200 bg-white py-16 lg:py-20">
      <div className="reveal mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <BrandLogo brand="monash" className="mx-auto mb-4 h-16 w-auto" decorative={false} />
        <p className="text-sm font-medium text-indigo-700">About the project</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">A {PROJECT.institution} Final Year Project</h2>
        <p className="mx-auto mt-3 max-w-3xl text-lg text-slate-500">
          <span className="slayql-logo text-[1.12em] tracking-tight inline-flex align-baseline mr-1"><span className="slay">Slay</span><span className="ql">QL</span></span> {PROJECT.programme}, team {PROJECT.team}. Code and every result are on GitHub.
        </p>

        {[['Supervisors', supervisors], ['Team', members]].map(([group, people]) => people.length > 0 && (
          <div key={group} className="mt-10">
            <p className="text-sm font-medium text-slate-500">{group}</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-3">
              {people.map((person) => (
                <li key={person.name} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white py-2.5 pl-2.5 pr-5 text-left shadow-[0_10px_24px_-20px_rgba(67,56,202,0.6)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-semibold text-white" aria-hidden="true">
                    {person.name.replace(/^Dr\.?\s+/, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{person.name}<PlaceholderTag show={person.placeholder} /></span>
                    <span className="block text-xs text-slate-500">{person.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {PROJECT.researchRepoPublic && (
            <a href={PROJECT.researchRepo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <BrandLogo brand="github" className="h-4 w-4" /> Research: {RESEARCH_NAME}
            </a>
          )}
          <a href={PROJECT.appRepo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <BrandLogo brand="github" className="h-4 w-4" /> Software: SlayQL
          </a>
        </div>
      </div>
    </section>
  );
}
