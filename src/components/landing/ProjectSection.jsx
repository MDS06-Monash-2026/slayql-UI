import React from 'react';
import { Github, GraduationCap, Quote } from 'lucide-react';
import { FIELD_STATS, PROJECT, VOICES, showPlaceholders, visible } from '../../content/projectInfo';

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
  const supervisor = visible([PROJECT.supervisor])[0];
  const members = PROJECT.members;
  const teamReady = members.every((m) => !m.placeholder);
  // Show the team only once every name is filled in (or in development, to review the layout).
  const shownMembers = teamReady || showPlaceholders ? members : [];

  return (
    <section id="about" className="border-t border-slate-200 bg-white py-16 lg:py-20">
      <div className="reveal mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <GraduationCap className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-medium text-indigo-700">About the project</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">A {PROJECT.institution} Final Year Project</h2>
        <p className="mx-auto mt-3 max-w-3xl text-lg text-slate-500">
          SlayQL is the {PROJECT.programme} of team {PROJECT.team}. It combines our schema-linking research, C-CaSE, with a trust layer and a
          working product for Malaysian businesses. The software, its evaluation and every result shown here are on GitHub.
        </p>

        {(supervisor || shownMembers.length > 0) && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {supervisor && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left">
                <p className="text-sm font-semibold text-slate-900">{supervisor.name}<PlaceholderTag show={supervisor.placeholder} /></p>
                <p className="text-xs text-slate-500">{supervisor.role}</p>
              </div>
            )}
            {shownMembers.map((member) => (
              <div key={member.name} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left">
                <p className="text-sm font-semibold text-slate-900">{member.name}<PlaceholderTag show={member.placeholder} /></p>
                <p className="text-xs text-slate-500">{member.role}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {PROJECT.researchRepoPublic && (
            <a href={PROJECT.researchRepo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Github className="h-4 w-4" aria-hidden="true" /> Research: C-CaSE
            </a>
          )}
          <a href={PROJECT.appRepo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Github className="h-4 w-4" aria-hidden="true" /> Software: SlayQL
          </a>
        </div>
      </div>
    </section>
  );
}
