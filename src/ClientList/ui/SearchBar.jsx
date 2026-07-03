// src/ClientList/ui/SearchBar.jsx
import React from "react";
import { TextField, InputAdornment, IconButton } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

export default function SearchBar({ search, setSearch, setPage }) {
  return (
    <TextField
      placeholder="Search by name, case title…"
      value={search}
      onChange={(e) => { setSearch(e.target.value); setPage(0); }}
      size="small"
      sx={{ width: { xs: "100%", md: 360 } }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon />
          </InputAdornment>
        ),
        endAdornment: search ? (
          <InputAdornment position="end">
            <IconButton size="small" onClick={() => { setSearch(""); setPage(0); }}>
              ×
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );
}