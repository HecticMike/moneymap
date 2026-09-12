import type { Config } from 'tailwindcss';

/**
 * Palette carried over verbatim from money-map v1 — this is the part of the app
 * that works and must not drift.
 *
 * `amber` is new. In v1 it was referenced 25 times (`text-brand-amber`,
 * `hover:text-brand-amber`, `hover:bg-brand-amber`) but was never defined, so
 * every one of those classes silently did nothing and the app had no hover
 * feedback at all. It is defined here as a *brighter* yellow than `highlight`
 * so it reads as "lit up" on hover against the dark ground.
 *
 * Static headings deliberately use `highlight`, not `amber`, so they render at
 * exactly the colour v1 shipped with.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          midnight: '#090b1d',
          ocean: '#11193b',
          slate: '#1e264c',
          line: '#2f355a',
          highlight: '#facc15',
          amber: '#fde047',
          accent: '#f87171',
          neutral: '#fef3c7',
          positive: '#6ee7b7'
        }
      },
      boxShadow: {
        panel: '0 18px 40px rgba(8, 12, 32, 0.55)'
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
