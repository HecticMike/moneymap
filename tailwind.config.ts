import type { Config } from 'tailwindcss';

/**
 * The identity — midnight ground, yellow accent, Space Grotesk — is settled and
 * carried over from money-map v1 unchanged. Everything else here is the 2026
 * modernisation.
 *
 * The two changes that do the most work:
 *
 * 1. **Text is no longer yellow.** v1 set `color: #facc15` on :root, so body
 *    copy, labels, numbers and headings were all the same yellow. When
 *    everything is the accent, nothing is — and long text in saturated yellow
 *    on navy is genuinely hard to read. Body text is now `ink`, and yellow is
 *    spent only on amounts, active states and actions, where it means
 *    something.
 *
 * 2. **Surfaces are layered rather than uniform.** v1 drew every panel as the
 *    same 1px box on the same translucent fill, so a page of eight sections
 *    read as eight identical rectangles with no grouping. There is now a real
 *    elevation ladder: base → raised → high, with inset for content wells.
 *
 * `radius.*` is deliberately a single pair of tokens. Set both to 0 to return
 * to v1's hard-edged look in one edit.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identity. Unchanged from v1.
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
        },

        // Elevation ladder.
        surface: {
          base: '#070915',
          raised: '#0e1430',
          high: '#161d40',
          inset: '#080b1c'
        },

        // Text. Warm greys so they sit with the yellow rather than fight it.
        // Three distinct levels, all kept above roughly 4.5:1 on `raised` —
        // the tertiary tier is used at 11px, where a dimmer grey stops being
        // "subtle" and starts being unreadable.
        ink: {
          DEFAULT: '#e8e6f0',
          muted: '#a9afcb',
          faint: '#848bad'
        },

        edge: {
          DEFAULT: '#222a4e',
          strong: '#333c6b'
        }
      },

      borderRadius: {
        card: '14px',
        control: '10px',
        pill: '999px'
      },

      boxShadow: {
        // Layered rather than one heavy drop, so cards lift without muddying.
        card: '0 1px 2px rgba(4, 6, 16, 0.6), 0 8px 24px -12px rgba(4, 6, 16, 0.9)',
        lifted: '0 2px 4px rgba(4, 6, 16, 0.5), 0 16px 40px -16px rgba(4, 6, 16, 0.95)',
        glow: '0 0 0 1px rgba(250, 204, 21, 0.35), 0 8px 28px -10px rgba(250, 204, 21, 0.25)',
        inset: 'inset 0 1px 2px rgba(4, 6, 16, 0.7)'
      },

      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif']
      },

      fontSize: {
        // A real scale. v1 lived almost entirely at 10-11px.
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.14em' }],
        caption: ['0.75rem', { lineHeight: '1.1rem' }],
        body: ['0.875rem', { lineHeight: '1.35rem' }],
        lead: ['1rem', { lineHeight: '1.5rem' }],
        figure: ['1.375rem', { lineHeight: '1.6rem', letterSpacing: '-0.01em' }],
        display: ['2.25rem', { lineHeight: '2.4rem', letterSpacing: '-0.02em' }]
      },

      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)'
      },

      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'grow-x': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' }
        }
      },

      animation: {
        'rise-in': 'rise-in 0.28s cubic-bezier(0.16, 1, 0.3, 1) both',
        'grow-x': 'grow-x 0.5s cubic-bezier(0.16, 1, 0.3, 1) both'
      }
    }
  },
  plugins: []
};

export default config;
