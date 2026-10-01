import React from 'react';
import { Github } from 'lucide-react';

export default function Footer({ setView }) {
  return (
    <footer className="bg-slate-900 text-slate-400 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main Footer columns */}
        <div className="py-14 grid grid-cols-2 md:grid-cols-4 gap-8">

          {/* Brand Signature Column */}
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4 cursor-pointer" onClick={() => setView('landing')}>
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-sm flex items-center justify-center">
                <img src="/SlayQLlogo.png" alt="SlayQL Logo" className="w-full h-full object-contain" />
              </div>
              <span className="text-white font-bold text-lg">SlayQL</span>
            </div>
            <p className="text-sm leading-relaxed max-w-xs">
              Trustworthy answers from your company's data. A Monash University Malaysia Final Year Project (MDS06): schema-linking research (C-CaSE, extending AutoLink) plus a trust layer that checks every answer.
            </p>
          </div>

          {/* Column 2 */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Explore</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="#workspace" className="hover:text-white transition-colors">Workspace</a></li>
              <li><a href="#how-it-works" className="hover:text-white transition-colors">How it works</a></li>
              <li><a href="#results" className="hover:text-white transition-colors">Results</a></li>
              <li><a href="#malaysia" className="hover:text-white transition-colors">Malaysia</a></li>
              <li><a href="#about" className="hover:text-white transition-colors">About the project</a></li>
            </ul>
          </div>

          {/* Column 3 */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Resources</h4>
            <ul className="space-y-3 text-sm">
              <li><a href="https://github.com/MDS06-Monash-2026/slayql-UI" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a></li>
              <li><a href="https://arxiv.org/abs/2511.17190" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">AutoLink paper</a></li>
              <li><a href="https://github.com/MDS06-Monash-2026/slayql-UI#readme" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Documentation</a></li>
            </ul>
          </div>

        </div>

        {/* Footer Bottom */}
        <div className="py-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>© 2026 C-CaSE and SlayQL. Monash University Malaysia, MDS06 FYP group.</div>
          <a href="https://github.com/MDS06-Monash-2026/slayql-UI" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
            <Github className="w-4 h-4" />
            <span>View on GitHub</span>
          </a>
        </div>

      </div>
    </footer>
  );
}
