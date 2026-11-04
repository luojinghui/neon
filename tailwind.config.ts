import type { Config } from 'tailwindcss';
const { fontFamily } = require('tailwindcss/defaultTheme');

const config = {
  darkMode: 'class',
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    // Only four UI radii; none/full describe shapes, not extra scale steps.
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      xl: 'var(--radius-xl)',
      full: '9999px'
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          soft: 'hsl(var(--primary-soft))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          soft: 'hsl(var(--accent-soft))'
        },
        background: 'hsl(var(--background))',
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          secondary: 'hsl(var(--foreground-secondary))',
          muted: 'hsl(var(--foreground-muted))'
        },
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          inset: 'hsl(var(--surface-inset))',
          hover: 'hsl(var(--surface-hover))',
          active: 'hsl(var(--surface-active))'
        },
        border: {
          DEFAULT: 'hsl(var(--border))',
          hover: 'hsl(var(--border-hover))',
          focus: 'hsl(var(--border-focus))'
        },
        ring: {
          DEFAULT: 'hsl(var(--ring))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          soft: 'hsl(var(--success-soft))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          soft: 'hsl(var(--warning-soft))'
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          soft: 'hsl(var(--danger-soft))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          soft: 'hsl(var(--info-soft))'
        },
        chat: {
          self: 'hsl(var(--chat-bubble-self))',
          'self-foreground': 'hsl(var(--chat-bubble-self-foreground))',
          other: 'hsl(var(--chat-bubble-other))',
          'other-foreground': 'hsl(var(--chat-bubble-other-foreground))'
        },
        sidebar: {
          active: 'hsl(var(--sidebar-active))'
        },
        overlay: 'hsl(var(--overlay))'
      },
      backgroundColor: {
        overlay: 'hsl(var(--overlay))'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      },
      // Semantic roles are the public typography API; common legacy sizes share it.
      fontSize: {
        caption: ['var(--font-size-caption)', { lineHeight: 'var(--line-height-caption)' }],
        body: ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
        'body-lg': ['var(--font-size-body-lg)', { lineHeight: 'var(--line-height-body-lg)' }],
        title: ['var(--font-size-title)', { lineHeight: 'var(--line-height-title)' }],
        heading: ['var(--font-size-heading)', { lineHeight: 'var(--line-height-heading)' }],
        display: ['var(--font-size-display)', { lineHeight: 'var(--line-height-display)' }],
        xs: ['var(--font-size-caption)', { lineHeight: 'var(--line-height-caption)' }],
        sm: ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
        base: ['var(--font-size-body-lg)', { lineHeight: 'var(--line-height-body-lg)' }],
        lg: ['var(--font-size-title)', { lineHeight: 'var(--line-height-title)' }],
        '2xl': ['var(--font-size-heading)', { lineHeight: 'var(--line-height-heading)' }]
      },
      fontWeight: {
        normal: 'var(--font-weight-regular)',
        medium: 'var(--font-weight-medium)',
        semibold: 'var(--font-weight-semibold)'
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...fontFamily.sans]
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
} satisfies Config;

export default config;
