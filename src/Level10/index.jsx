// src/Level10/index.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import db from "../firebase";
import {
  Box,
  Stack,
  Button,
  Typography,
  Paper,
  IconButton,
  Tooltip,
} from "@mui/material";
import MonthBar from "./MonthBar";
import ScorecardTable from "./Scorecard/ScorecardTable";
import {
  loadMonth,
  loadWeeksMap,
  ensureMonthColumn,
  upsertWeekMetrics,
  saveGlobalOwners,
  loadGlobalOwners,
  migrateOwnersIfNeeded,
} from "./services/level10.api";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";

// ⬇️ CHANGED: use TrendsTab wrapper (not TrendsPanel)
import TrendsTab from "./Trends/TrendsTab";

// Default owners if nothing exists anywhere.
const DEFAULT_OWNERS = {
  // ---- Overall ----
  total_cases_in_plans: "Billing",
  number_in_autopay: "Billing",
  percent_in_autopay: "Billing",
  number_in_manual: "Billing",
  percent_in_manual: "Billing",
  total_cases_current: "Billing",
  total_cases_past_due: "Billing",
  lt60_pd: "Billing",
  percent_lt60_pd: "Billing",
  gt60_pd: "Billing",
  percent_gt60_pd: "Billing",
  paused_clients: "Billing",

  // ---- Recovery ----
  expected_payments_month: "Billing",
  payments_received_week: "Billing",
  payments_received_mtd: "Billing",
  autopay_collection_rate: "Billing",
  past_due_recovery_30p: "Billing",
  mtd_pct_past_due_recovered: "Billing",
  clients_recovered_from_pd: "Billing",
  total_outstanding_ar: "Billing",
  clients_owing_only_current_month: "Billing",

  // ---- Termination ----
  ytd_paused_clients: "Billing",
  warning_letters_sent: "Billing",
  terminations_finalized: "Billing",
  refunds_issued: "Billing",
  ytd_refunds: "Billing",
};

// ==== Metric Registry (with units) ====
// Reordered per your requested sequence
export const METRICS = [
  // 🟦 Overall Case Numbers
  { id: "total_cases_in_plans", label: "Total Number of Cases in Plans", section: "overall", type: "A", unit: "#" },   // 1
  { id: "number_in_autopay", label: "Number in Autopay", section: "overall", type: "M", unit: "#" },                  // 2
  { id: "percent_in_autopay", label: "Percent in Autopay", section: "overall", type: "M", unit: "%" },                // 3
  { id: "number_in_manual", label: "Number in Manual Collection", section: "overall", type: "M", unit: "#" },         // 4

  // ⬇️ Changed to Manual (M)
  { id: "percent_in_manual", label: "Percent in Manual Collection", section: "overall", type: "M", unit: "%" },       // 5

  { id: "total_cases_current", label: "Total Number Cases Current", section: "overall", type: "A", unit: "#" },       // 6
  { id: "total_cases_past_due", label: "Total Number Cases Past Due", section: "overall", type: "A", unit: "#" },     // 7
  { id: "lt60_pd", label: "Number of Cases < 60 Days Past Due", section: "overall", type: "A", unit: "#" },           // 8
  { id: "percent_lt60_pd", label: "% of Clients < 60 Days Past Due", section: "overall", type: "A", unit: "%" },      // 9
  { id: "gt60_pd", label: "Number of Cases > 60 Days Past Due", section: "overall", type: "A", unit: "#" },           // 10
  { id: "percent_gt60_pd", label: "% of Clients > 60 Days Past Due", section: "overall", type: "A", unit: "%" },      // 11
  { id: "paused_clients", label: "# of Paused Payment Clients (active)", section: "overall", type: "A", unit: "#" },  // 12

  // 🟩 Payment Recovery
  { id: "expected_payments_month", label: "Expected Payments (This Month)", section: "recovery", type: "A", unit: "$" },     // 1
  { id: "payments_received_week", label: "Payments Received (week)", section: "recovery", type: "A", unit: "$" },            // 2
  { id: "payments_received_mtd", label: "MTD Payments Received", section: "recovery", type: "A", unit: "$" },               // 3
  { id: "autopay_collection_rate", label: "Autopay Collection Rate", section: "recovery", type: "M", unit: "%" },           // 4
  { id: "past_due_recovery_30p", label: "Past Due Recovery (30+ Days)", section: "recovery", type: "A", unit: "$" },        // 5
  { id: "mtd_pct_past_due_recovered", label: "MTD % Past Due Recovered", section: "recovery", type: "A", unit: "%" },       // 6
  { id: "clients_recovered_from_pd", label: "Clients Recovered from Past Due", section: "recovery", type: "A", unit: "#" }, // 7
  { id: "total_outstanding_ar", label: "Total Outstanding A/R", section: "recovery", type: "A", unit: "$" },                // 8
  { id: "clients_owing_only_current_month", label: "Clients Owing Only Current Month", section: "recovery", type: "A", unit: "#" }, // 9

  // 🟥 Termination process
  { id: "ytd_paused_clients", label: "YTD Paused Payment Clients", section: "termination", type: "A", unit: "#" },     // 1
  { id: "warning_letters_sent", label: "Warning Letters Sent", section: "termination", type: "M", unit: "#" },         // 2
  { id: "terminations_finalized", label: "Terminations Finalized", section: "termination", type: "M", unit: "#" },     // 3
  { id: "refunds_issued", label: "Refunds Issued", section: "termination", type: "M", unit: "$" },                     // 4
  { id: "ytd_refunds", label: "YTD Refunds", section: "termination", type: "M", unit: "$" },                           // 5
];

const SECTIONS = [
  { key: "overall", title: "Overall Case Numbers" },
  { key: "recovery", title: "Payment Recovery" },
  { key: "termination", title: "Termination Process" },
  { key: "trends", title: "Data Analysis" }, // ⬅️ NEW TAB
];

// helpers
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const ym = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function Level10() {
  const [tab, setTab] = useState(0);
  const [month, setMonth] = useState(ym(new Date()));
  const [meetingDate, setMeetingDate] = useState(ymd(new Date()));

  const [columns, setColumns] = useState([]);
  const [weeksMap, setWeeksMap] = useState({});
  const [ownerByMetric, setOwnerByMetric] = useState({});
  const [ownersEditMode, setOwnersEditMode] = useState(false);
  const [busy, setBusy] = useState(false);

  // ⬇️ NEW: local clients for TrendsPanel only
  const [clientsForTrends, setClientsForTrends] = useState([]);

  const activeSection = SECTIONS[tab]?.key;

  // Load month structure + weeks + GLOBAL OWNERS
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        // Month data
        const m = await loadMonth(month);
        const w = await loadWeeksMap(month);
        if (cancelled) return;
        setColumns(Array.isArray(m.columns) ? m.columns.slice().sort() : []);
        setWeeksMap(w || {});

        // Owners: try global → migrate legacy if needed → seed defaults if still empty
        let owners = await loadGlobalOwners();
        if (!owners || Object.keys(owners).length === 0) {
          const migrated = await migrateOwnersIfNeeded(month);
          owners = migrated && Object.keys(migrated).length > 0 ? migrated : {};
        }
        if (!owners || Object.keys(owners).length === 0) {
          owners = { ...DEFAULT_OWNERS };
          await saveGlobalOwners(owners);
        }
        if (!cancelled) setOwnerByMetric(owners);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month]);

  // ⬇️ NEW: load clients once for TrendsPanel (doesn't touch your existing logic)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        setClientsForTrends(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load clients for trends:", e);
      }
    })();
  }, []);

  // Lightweight reload helper (for after populate & deletes)
  const reloadMonth = async () => {
    const m = await loadMonth(month);
    const w = await loadWeeksMap(month);
    setColumns(Array.isArray(m.columns) ? m.columns.slice().sort() : []);
    setWeeksMap(w || {});
    // Also refresh global owners (in case you edited in another tab)
    const owners = await loadGlobalOwners();
    if (owners && Object.keys(owners).length > 0) setOwnerByMetric(owners);
  };

  // Compute live auto metrics
  const computeLive = async (dateYmd) => {
    const monday = new Date(dateYmd);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const snap = await getDocs(collection(db, "clients"));
    const clients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { computeAll } = await import("./services/metrics.compute.js");
    const live = computeAll({
      clients,
      monday,
      sunday,
      month,
      tz: "America/New_York",
      dueDay: 15,
    });
    return live.metrics || {};
  };

  // Populate Week flow
  const populateWeek = async () => {
    try {
      setBusy(true);
      const picked = new Date(meetingDate);
      const pickedMonth = ym(picked);
      if (pickedMonth !== month) setMonth(pickedMonth);

      const metrics = await computeLive(meetingDate);
      await ensureMonthColumn(pickedMonth, meetingDate);
      await upsertWeekMetrics({
        month: pickedMonth,
        dateYmd: meetingDate,
        metrics,
        createdBy: "Level10 Button",
      });
      await reloadMonth();
    } catch (e) {
      console.error("Populate failed:", e);
      alert(`Populate failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  // Owner edit toggle + save (writes to GLOBAL owners)
  const toggleOwners = () => setOwnersEditMode((v) => !v);
  const saveOwnersAndExit = async () => {
    try {
      setBusy(true);
      await saveGlobalOwners(ownerByMetric);
      setOwnersEditMode(false);
    } finally {
      setBusy(false);
    }
  };

  const metricsForSection = useMemo(
    () => METRICS.filter((m) => m.section === activeSection),
    [activeSection]
  );
  const renderColumns = useMemo(() => columns.slice().sort(), [columns]);

  // ⬇️ NEW: stable week dates for the TrendsPanel (derived from meetingDate)
  const mondayDate = useMemo(() => new Date(meetingDate), [meetingDate]);
  const sundayDate = useMemo(() => {
    const d = new Date(meetingDate);
    d.setDate(d.getDate() + 6);
    return d;
  }, [meetingDate]);

  return (
    <Box>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", md: "center" }}
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <MonthBar
          month={month}
          setMonth={setMonth}
          meetingDate={meetingDate}
          setMeetingDate={setMeetingDate}
          onPopulateWeek={populateWeek}
          onRunToday={() => {
            const today = new Date();
            setMeetingDate(ymd(today));
          }}
          onDeleted={reloadMonth}
        />
      </Stack>

      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {SECTIONS[tab]?.title}
          </Typography>

          <Tooltip title={ownersEditMode ? "Save Owners" : "Edit Owners"}>
            <span>
              <IconButton
                onClick={ownersEditMode ? saveOwnersAndExit : toggleOwners}
                disabled={busy}
                size="small"
              >
                {ownersEditMode ? <CheckIcon /> : <EditIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {SECTIONS.map((s, idx) => (
            <Button
              key={s.key}
              variant={idx === tab ? "contained" : "text"}
              onClick={() => setTab(idx)}
              size="small"
            >
              {s.title}
            </Button>
          ))}
        </Stack>

        {activeSection === "trends" ? (
          <TrendsTab
            clients={clientsForTrends}
            monday={mondayDate}
            sunday={sundayDate}
            month={month}
            dueDay={15}
          />
        ) : (
          <ScorecardTable
            metricsDef={metricsForSection}
            ownerByMetric={ownerByMetric}
            setOwnerByMetric={setOwnerByMetric}
            ownersEditMode={ownersEditMode}
            columns={renderColumns}
            weeksMap={weeksMap}
            month={month}
          />
        )}
      </Paper>
    </Box>
  );
}