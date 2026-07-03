// src/ClientList/model/theme.js
import { createTheme } from "@mui/material/styles";
import { deepmerge } from "@mui/utils";

export const clientListTheme = (outerTheme) =>
  createTheme(
    deepmerge(outerTheme, {
      palette: {
        primary: { main: "#0b3a75" },
        success: { main: "#28a745" },
        error: { main: "#dc3545" },
        info: { main: "#007bff" },
      },
      components: {
        MuiCard: {
          styleOverrides: {
            root: ({ theme }) => ({
              borderRadius: 16,
              boxShadow: "0 8px 30px rgba(0,0,0,0.06)",
              border:
                theme.palette.mode === "light"
                  ? "1px solid rgba(2,55,112,0.08)"
                  : "1px solid rgba(255,255,255,0.12)",
            }),
          },
        },
        MuiTableRow: {
          styleOverrides: {
            root: ({ theme }) => ({
              "&:nth-of-type(odd)": {
                backgroundColor:
                  theme.palette.mode === "light"
                    ? "rgba(2,55,112,0.02)"
                    : "rgba(255,255,255,0.03)",
              },
            }),
          },
        },
        MuiLink: {
          styleOverrides: {
            root: ({ theme }) => ({
              color:
                theme.palette.mode === "dark"
                  ? theme.palette.primary.light
                  : theme.palette.primary.main,
              fontWeight: 600,
              "&:hover": {
                textDecorationColor:
                  theme.palette.mode === "dark"
                    ? theme.palette.primary.light
                    : theme.palette.primary.main,
              },
            }),
          },
        },
      },
      typography: {
        fontFamily:
          "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },
    })
  );