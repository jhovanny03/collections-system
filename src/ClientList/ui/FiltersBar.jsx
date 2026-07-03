// src/ClientList/ui/FiltersBar.jsx
import React from "react";
import { Stack, TextField, MenuItem } from "@mui/material";

export default function FiltersBar({
  caseStatusFilter, setCaseStatusFilter, caseStatuses,
  overdueFilter, setOverdueFilter, overdueOptions,
  caseTypeFilter, setCaseTypeFilter, caseTypes,
  monthsPastDueFilter, setMonthsPastDueFilter, monthsPastDueOptions,
  actionsFilter, setActionsFilter, actionsOptions,
  setPage,
}) {
  // helper to reset pagination when a filter changes
  const onChange = (setter) => (e) => { setter(e.target.value); setPage(0); };

  return (
    <Stack direction="row" spacing={2} flexWrap="wrap">
      <TextField
        select label="Case Status" size="small" sx={{ minWidth: 160 }}
        value={caseStatusFilter} onChange={onChange(setCaseStatusFilter)}
      >
        {caseStatuses.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>

      <TextField
        select label="Overdue" size="small" sx={{ minWidth: 140 }}
        value={overdueFilter} onChange={onChange(setOverdueFilter)}
      >
        {overdueOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>

      <TextField
        select label="Case Type" size="small" sx={{ minWidth: 200 }}
        value={caseTypeFilter} onChange={onChange(setCaseTypeFilter)}
      >
        {caseTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
      </TextField>

      <TextField
        select label="Months Past Due" size="small" sx={{ minWidth: 160 }}
        value={monthsPastDueFilter} onChange={onChange(setMonthsPastDueFilter)}
      >
        {monthsPastDueOptions.map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
      </TextField>

      <TextField
        select label="Case Flags" size="small" sx={{ minWidth: 180 }}
        value={actionsFilter} onChange={onChange(setActionsFilter)}
      >
        {actionsOptions.map((opt) => <MenuItem key={opt} value={opt}>{opt}</MenuItem>)}
      </TextField>
    </Stack>
  );
}