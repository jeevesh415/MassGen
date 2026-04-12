/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom colors for agent status
        'agent-working': '#3B82F6',    // blue-500
        'agent-voting': '#F59E0B',      // amber-500
        'agent-completed': '#10B981',   // green-500
        'agent-failed': '#EF4444',      // red-500
        'agent-waiting': '#6B7280',     // gray-500
        // Winner highlight
        'winner-gold': '#EAB308',       // yellow-500
        'winner-glow': 'rgba(234, 179, 8, 0.4)',
        // v2 Design System — Discord-style
        'v2-sidebar': 'var(--v2-sidebar)',
        'v2-sidebar-hover': 'var(--v2-sidebar-hover)',
        'v2-sidebar-active': 'var(--v2-sidebar-active)',
        'v2-main': 'var(--v2-main)',
        'v2-surface': 'var(--v2-surface)',
        'v2-surface-raised': 'var(--v2-surface-raised)',
        'v2-border': 'var(--v2-border)',
        'v2-border-subtle': 'var(--v2-border-subtle)',
        'v2-text': 'var(--v2-text)',
        'v2-text-secondary': 'var(--v2-text-secondary)',
        'v2-text-muted': 'var(--v2-text-muted)',
        'v2-accent': 'var(--v2-accent)',
        'v2-accent-hover': 'var(--v2-accent-hover)',
        'v2-online': '#23A559',
        'v2-idle': '#F0B232',
        'v2-offline': '#80848E',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Monaco', 'Consolas', 'monospace'],
      },
      spacing: {
        'v2-sidebar': '240px',
        'v2-sidebar-collapsed': '72px',
      },
      borderRadius: {
        'v2-card': '8px',
        'v2-input': '6px',
        'v2-modal': '12px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
        'v2-slide-in-left': 'v2SlideInLeft 0.2s ease-out',
        'v2-fade-in': 'v2FadeIn 0.15s ease-out',
        'v2-shimmer': 'v2Shimmer 1.5s ease-in-out infinite',
        'v2-welcome-fade-in': 'v2WelcomeFadeIn 0.6s ease-out',
        'v2-chevron-bounce': 'v2ChevronBounce 2s ease-in-out infinite',
        'v2-stagger-fade-in': 'v2StaggerFadeIn 0.3s ease-out forwards',
        'v2-tile-enter': 'v2TileEnter 0.4s ease-out',
        'v2-overlay-backdrop': 'v2OverlayBackdrop 0.3s ease-out',
        'v2-overlay-content': 'v2OverlayContent 0.4s ease-out 0.05s both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px 5px rgba(234, 179, 8, 0.3)' },
          '50%': { boxShadow: '0 0 40px 10px rgba(234, 179, 8, 0.5)' },
        },
        v2SlideInLeft: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        v2FadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        v2Shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
        v2WelcomeFadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        v2ChevronBounce: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(4px)' },
        },
        v2StaggerFadeIn: {
          '0%': { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        v2TileEnter: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        v2OverlayBackdrop: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        v2OverlayContent: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
