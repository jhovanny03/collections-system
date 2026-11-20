// src/theme/brand.js
// Rahman Law PLLC brand (same palette and type as the firm's other tools):
//   Federal Blue #000C66 · Syracuse Red Orange #D34E24 · Persian Green #17A398
//   Headings: League Spartan · Body: Nunito Sans (loaded in public/index.html)
import { createTheme, alpha } from "@mui/material/styles";

export const BRAND = {
  blue: "#000C66",
  blueDark: "#00084A",
  blueSoft: "#E7E9F7",
  orange: "#D34E24",
  orangeSoft: "#FBEAE4",
  green: "#17A398",
  greenSoft: "#E3F5F3",
  red: "#A3191B",
  redSoft: "#FBE9E9",
  amber: "#B86E00",
  amberSoft: "#FFF3DF",
};

export const FONT_HEADING = "'League Spartan', 'Nunito Sans', system-ui, sans-serif";
export const FONT_BODY = "'Nunito Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** Chart colors, in order. Readable on light and dark backgrounds. */
export const chartColors = (mode = "light") =>
  mode === "dark"
    ? ["#8F98F0", "#2BC4B7", "#EE7A55", "#E0B03C", "#B98CE8", "#7FB0E8"]
    : [BRAND.blue, BRAND.green, BRAND.orange, "#C9961A", "#7A4FBF", "#3A78C2"];

/** Status colors used across the app (past due levels, follow-up states). */
export const statusColors = {
  current: BRAND.green,
  due: "#C9961A",
  pastDue: BRAND.orange,
  severe: BRAND.red,
};

export function createAppTheme(mode = "light") {
  const dark = mode === "dark";
  const c = {
    primary: dark ? "#8F98F0" : BRAND.blue,
    bg: dark ? "#0B0D17" : "#F4F5FA",
    paper: dark ? "#131628" : "#FFFFFF",
    text: dark ? "#EDEEF7" : "#0E1018",
    text2: dark ? "#A3A6BD" : "#5D6078",
    divider: dark ? "#272B45" : "#DCDEEC",
  };

  return createTheme({
    palette: {
      mode,
      primary: { main: c.primary, dark: dark ? "#6E78E0" : BRAND.blueDark, contrastText: dark ? "#0B0D17" : "#FFFFFF" },
      secondary: { main: dark ? "#EE7A55" : BRAND.orange, contrastText: "#FFFFFF" },
      success: { main: dark ? "#2BC4B7" : BRAND.green, contrastText: "#FFFFFF" },
      warning: { main: dark ? "#E0B03C" : BRAND.amber, contrastText: "#FFFFFF" },
      error: { main: dark ? "#EF6B6B" : BRAND.red, contrastText: "#FFFFFF" },
      info: { main: dark ? "#7FB0E8" : "#2F6DB5" },
      background: { default: c.bg, paper: c.paper },
      text: { primary: c.text, secondary: c.text2 },
      divider: c.divider,
      brand: BRAND,
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT_BODY,
      h1: { fontFamily: FONT_HEADING, fontWeight: 700 },
      h2: { fontFamily: FONT_HEADING, fontWeight: 700 },
      h3: { fontFamily: FONT_HEADING, fontWeight: 700 },
      h4: { fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "1.75rem", letterSpacing: "-0.01em" },
      h5: { fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "1.4rem" },
      h6: { fontFamily: FONT_HEADING, fontWeight: 600, fontSize: "1.1rem" },
      subtitle1: { fontWeight: 700 },
      subtitle2: { fontWeight: 700 },
      overline: { fontWeight: 800, letterSpacing: "0.08em" },
      button: { textTransform: "none", fontWeight: 700 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: c.bg },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": { backgroundColor: alpha(c.text2, 0.35), borderRadius: 8 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8 }, sizeSmall: { padding: "4px 12px" } },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
          outlined: { borderColor: c.divider },
          elevation1: {
            boxShadow: dark
              ? "0 1px 2px rgba(0,0,0,.5), 0 8px 24px -8px rgba(0,0,0,.6)"
              : "0 1px 2px rgba(0,12,102,.04), 0 4px 12px rgba(0,12,102,.05), 0 12px 32px -12px rgba(0,12,102,.10)",
          },
        },
      },
      MuiCard: { defaultProps: { elevation: 1 }, styleOverrides: { root: { borderRadius: 12 } } },
      MuiChip: { styleOverrides: { root: { fontWeight: 700 }, sizeSmall: { height: 22 } } },
      MuiTableCell: {
        styleOverrides: {
          head: { fontWeight: 800, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", color: c.text2 },
        },
      },
      MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 700, minHeight: 44 } } },
      MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiAlert: { styleOverrides: { root: { borderRadius: 10 } } },
    },
  });
}
