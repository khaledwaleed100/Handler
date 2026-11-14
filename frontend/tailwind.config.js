/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Classes built at runtime ('pos-' + position, 'tier-' + tier) must be kept explicitly.
  safelist: [
    'pos-GK', 'pos-DEF', 'pos-MID', 'pos-FWD',
    'tier-elite', 'tier-gold', 'tier-silver', 'tier-bronze'
  ],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: []
};
