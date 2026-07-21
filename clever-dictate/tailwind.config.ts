import type { Config } from "tailwindcss";

/**
 * "Deep Enterprise Dark Mode" design tokens.
 * Sourced from designs/deep_enterprise_dark_mode/DESIGN.md.
 * Depth via tonal layering + 1px inner borders, not shadows.
 */
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Base canvas layers
        base: "#0A0B0D", // Level 0 root background
        surface: "#12141C", // Level 1 cards, sidebars
        overlay: "#1E202A", // Level 2 modals, dropdowns
        elevated: "#292A2C",
        // AI / Vision accents
        core: "#3B82F6", // Electric Cobalt — AI Core / primary actions
        vision: "#8B5CF6", // Hyper-Purple — VLM / vision features
        // Status
        success: "#10B981", // Muted Emerald
        destructive: "#EF4444", // Crimson Red
        // Text hierarchy
        dominant: "#F9FAFB",
        secondary: "#9CA3AF",
        // Hairline borders
        hairline: "rgba(255,255,255,0.08)",
        "hairline-strong": "rgba(255,255,255,0.12)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px", // buttons/inputs/chips
        lg: "8px", // cards/modals
      },
      fontSize: {
        "headline-xl": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        "headline-md": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "500" }],
      },
      keyframes: {
        waveform: {
          "0%, 100%": { height: "8px" },
          "50%": { height: "24px" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        waveform: "waveform 1.2s ease-in-out infinite",
        "pulse-slow": "pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
