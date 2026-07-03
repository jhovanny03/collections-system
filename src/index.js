import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CssBaseline } from "@mui/material";

// ⭐ ADD THESE TWO IMPORTS
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

const rootEl = document.getElementById("root");

if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      {/* Global Material UI reset */}
      <CssBaseline />

      {/* ⭐ REQUIRED for DateCalendar, PickersDay, etc. */}
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <App />
      </LocalizationProvider>
    </React.StrictMode>
  );
} else {
  console.warn("No #root element found. React app not mounted.");
}