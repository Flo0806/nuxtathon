import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// "Nuxt Hacker" design system. Palette is derived from the official Nuxt logo
// (primary green + mint) dropped onto a green-tinted phosphor black, with a
// single amber accent reserved for urgency (countdown, evaluation, lightning).
export default defineConfig({
  presets: [
    presetWind3(),
    presetAttributify(),
    presetIcons({
      scale: 1.15,
      warn: true,
    }),
    presetTypography(),
    presetWebFonts({
      // Bunny is a GDPR-friendly, drop-in replacement for Google Fonts.
      provider: 'bunny',
      fonts: {
        // Angular display face for the "Nuxtathon" reveal and headings.
        display: [{ name: 'Chakra Petch', weights: ['500', '600', '700'] }],
        // Monospace carries the terminal look and gives tabular ranking figures.
        mono: [{ name: 'JetBrains Mono', weights: ['400', '500', '700', '800'] }],
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  theme: {
    colors: {
      // Surfaces: near-black with a faint green tint, layered for depth.
      base: '#04100B',
      surface: '#081A13',
      panel: '#0E241A',
      line: '#1C4A38',
      // Brand.
      primary: '#00DC82',
      mint: '#80EEC0',
      deep: '#003543',
      // Sole contrast accent, used sparingly.
      amber: '#FFB020',
      // Foreground scale. `muted` drives the dimmed sub-top-10 rows.
      fg: '#D7FCEC',
      muted: '#6FA891',
      faint: '#3C5C4E',
    },
  },
  shortcuts: {
    // Raised container with the phosphor hairline border.
    panel: 'bg-surface border border-line rounded-md',
    // Neon glow helpers. Kept as shortcuts so the shadow stays consistent.
    glow: 'text-primary [text-shadow:0_0_14px_rgba(0,220,130,0.55)]',
    'glow-amber': 'text-amber [text-shadow:0_0_14px_rgba(255,176,32,0.5)]',
    // Terminal-style action. Uppercase mono with a hover-to-neon border.
    btn: 'inline-flex items-center gap-2 px-4 py-2 font-mono text-sm uppercase tracking-wider border border-line bg-surface text-fg transition-colors hover:(border-primary text-primary) disabled:(opacity-40 pointer-events-none)',
  },
})
