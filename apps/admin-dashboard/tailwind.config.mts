import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        'dt-base': '#ffffff',
        'dt-surface': '#ffffff',
        'dt-surface-elevated': '#f8f9fa',
        'dt-border': '#dadce0',
        'dt-text': '#202124',
        'dt-text-secondary': '#5f6368',
        'dt-accent': '#1a73e8',
        'dt-accent-hover': '#0057ae',
        'dt-success': '#137333',
        'dt-danger': '#c5221f',
        'dt-warning': '#ea8600'
      },
      borderRadius: {
        'dt': '10px',
        'dt-sm': '6px'
      },
      fontFamily: {
        dt: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

export default config;

