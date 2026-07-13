import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from "unocss";

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
      provider: "bunny",
      fonts: {
        // Angular display face for the "Nuxtathon" reveal and headings.
        display: [{ name: "Chakra Petch", weights: ["500", "600", "700"] }],
        // Monospace carries the terminal look and gives tabular ranking figures.
        mono: [{ name: "JetBrains Mono", weights: ["400", "500", "700", "800"] }],
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  theme: {
    colors: {
      // Surfaces: near-black with a faint green tint, layered for depth.
      base: "#04100B",
      surface: "#081A13",
      panel: "#0E241A",
      line: "#1C4A38",
      // Brand.
      primary: "#00DC82",
      mint: "#80EEC0",
      deep: "#003543",
      // Sole contrast accent, used sparingly.
      amber: "#FFB020",
      // Foreground scale. `muted` drives the dimmed sub-top-10 rows.
      fg: "#D7FCEC",
      muted: "#6FA891",
      faint: "#3C5C4E",
    },
    // Custom keyframes exposed as `animate-blink` / `animate-scan` utilities so
    // components stay in the utility layer instead of hand-written CSS.
    animation: {
      keyframes: {
        blink: "{50%{opacity:0.25}}",
        scan: "{to{transform:translateX(100%)}}",
        "title-in":
          "{0%{opacity:0;transform:scale(0.94);filter:blur(6px)}60%{opacity:1}100%{opacity:1;transform:scale(1);filter:blur(0)}}",
        "shutter-up":
          "{0%{transform:translateY(0);opacity:0}15%{opacity:1}80%{opacity:1}100%{transform:translateY(-115%);opacity:0}}",
        "shutter-down":
          "{0%{transform:translateY(0);opacity:0}15%{opacity:1}80%{opacity:1}100%{transform:translateY(115%);opacity:0}}",
        "seam-flash":
          "{0%{opacity:0;transform:translateY(-50%) scaleX(0)}20%{opacity:1}45%{opacity:1;transform:translateY(-50%) scaleX(1)}100%{opacity:0;transform:translateY(-50%) scaleX(1)}}",
        "bolt-a": "{0%,100%{opacity:0}8%{opacity:1}13%{opacity:0}21%{opacity:0.85}27%{opacity:0}}",
        "bolt-b": "{0%,100%{opacity:0}8%{opacity:1}13%{opacity:0}21%{opacity:0.85}27%{opacity:0}}",
        neon: "{0%,91%,100%{opacity:1}92%{opacity:0.82}93%{opacity:1}96%{opacity:0.9}97%{opacity:1}}",
        "fade-up":
          "{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}",
        "logo-in": "{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}",
      },
      durations: {
        blink: "1.2s",
        scan: "1.9s",
        "title-in": "0.9s",
        "shutter-up": "0.7s",
        "shutter-down": "0.7s",
        "seam-flash": "0.6s",
        "bolt-a": "1s",
        "bolt-b": "1s",
        neon: "7s",
        "fade-up": "0.6s",
        "logo-in": "0.5s",
      },
      timingFns: {
        blink: "steps(1)",
        scan: "linear",
        "title-in": "ease-out",
        "shutter-up": "cubic-bezier(0.2,0.9,0.1,1)",
        "shutter-down": "cubic-bezier(0.2,0.9,0.1,1)",
        "seam-flash": "ease-out",
        "bolt-a": "ease-out",
        "bolt-b": "ease-out",
        neon: "linear",
        "fade-up": "ease-out",
        "logo-in": "cubic-bezier(0.2,0.8,0.2,1.2)",
      },
      counts: { blink: "infinite", scan: "infinite", neon: "infinite" },
      // Per-animation delay and fill, so one `animate-*` utility carries the full
      // timing. Fill "both" holds the pre-delay start frame, avoiding a flash of
      // the final state before staggered animations begin.
      properties: {
        "title-in": { "animation-delay": "0.5s", "animation-fill-mode": "both" },
        "shutter-up": { "animation-delay": "0.35s", "animation-fill-mode": "both" },
        "shutter-down": { "animation-delay": "0.35s", "animation-fill-mode": "both" },
        "seam-flash": { "animation-delay": "0.3s", "animation-fill-mode": "both" },
        "bolt-a": { "animation-delay": "0.32s", "animation-fill-mode": "both" },
        "bolt-b": { "animation-delay": "0.44s", "animation-fill-mode": "both" },
        neon: { "animation-delay": "1.7s" },
        "fade-up": { "animation-delay": "1.15s", "animation-fill-mode": "both" },
        "logo-in": { "animation-delay": "1.4s", "animation-fill-mode": "both" },
      },
    },
  },
  shortcuts: {
    // Raised container with the phosphor hairline border.
    panel: "bg-surface border border-line rounded-md",
    // Neon glow helpers. Kept as shortcuts so the shadow stays consistent.
    glow: "text-primary [text-shadow:0_0_14px_rgba(0,220,130,0.55)]",
    "glow-amber": "text-amber [text-shadow:0_0_14px_rgba(255,176,32,0.5)]",
    // Small blinking amber status dot (live indicator, evaluating state).
    "pulse-dot":
      "inline-block w-2 h-2 rounded-full bg-amber shadow-[0_0_10px_var(--amber)] animate-blink motion-reduce:animate-none",
    // Terminal-style action. Uppercase mono with a hover-to-neon border.
    btn: "inline-flex items-center gap-2 px-4 py-2 font-mono text-sm uppercase tracking-wider border border-line bg-surface text-fg transition-colors hover:(border-primary text-primary) disabled:(opacity-40 pointer-events-none)",
  },
});
