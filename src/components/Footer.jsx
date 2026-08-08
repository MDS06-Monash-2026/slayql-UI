import React from 'react';
import { Github } from 'lucide-react';

export default function Footer({ setView }) {
  return (
    <footer class="bg-slate-900 text-slate-400 border-t border-slate-800">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Main Footer columns */}
        <div class="py-14 grid grid-cols-2 md:grid-cols-4 gap-8">

          {/* Brand Signature Column */}
          <div class="col-span-2 md:col-span-2">
            <div class="flex items-center gap-2.5 mb-4 cursor-pointer" onClick={() => setView('landing')}>
              <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="text-white">
                  <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                  <circle cx="19" cy="17" r="3" stroke="currentColor" stroke-width="2" fill="none"/>
                  <path d="M21.5 19.5L23 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </div>
              <span class="text-white font-bold text-lg">SlayQL-Lite</span>
            </div>
            <p class="text-sm leading-relaxed max-w-xs">
              Scalable Schema Exploration &amp; Value-Grounded Text-to-SQL. A C-CaSE / MDS06 FYP research project extending the AutoLink framework.
            </p>
          </div>

          {/* Column 2 */}
          <div>
            <h4 class="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Explore</h4>
            <ul class="space-y-3 text-sm">
              <li><a href="#workspace" class="hover:text-white transition-colors">Workspace</a></li>
              <li><a href="#architecture" class="hover:text-white transition-colors">Architecture</a></li>
              <li><a href="#benchmark" class="hover:text-white transition-colors">Benchmark</a></li>
              <li><a href="#ablation" class="hover:text-white transition-colors">Ablation Study</a></li>
            </ul>
          </div>

          {/* Column 3 */}
          <div>
            <h4 class="text-white font-semibold text-sm mb-4 uppercase tracking-wider">Resources</h4>
            <ul class="space-y-3 text-sm">
              <li><a href="https://github.com/MDS06-Monash-2026/C-CaSE" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">GitHub</a></li>
              <li><a href="https://arxiv.org/abs/2511.17190" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">Paper</a></li>
              <li><a href="https://github.com/MDS06-Monash-2026/C-CaSE#readme" target="_blank" rel="noopener noreferrer" class="hover:text-white transition-colors">Documentation</a></li>
            </ul>
          </div>

        </div>

        {/* Footer Bottom */}
        <div class="py-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>© 2026 C-CaSE / SlayQL-Lite — Monash University Malaysia, MDS06 FYP Group.</div>
          <a href="https://github.com/MDS06-Monash-2026/C-CaSE" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1.5 hover:text-slate-300 transition-colors">
            <Github class="w-4 h-4" />
            <span>View on GitHub</span>
          </a>
        </div>

      </div>
    </footer>
  );
}
