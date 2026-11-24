// src/Team/PhoneActivity.jsx
// Calls and talk time per billing team member, from RingCentral (ringcentralCalls, filled
// by the call import: functions/ringcentral.js).
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Box, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { collection, getDocs, query, where } from "firebase/firestore";
import db from "../firebase";
import { pct, money, usePortfolio } from "../billing/portfolio";
import { useClients } from "../data/ClientsProvider";
import { callsByClient, creditTotals, CREDIT_DAYS } from "../billing/callCredit";
import { Section } from "../ui/kit";

const TEAM = ["Miguel Cañas", "Arianna Orantes", "David Cuellar", "Francisco Jimenez", "Arleen Francisco"];
const hm = (sec) => {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export default function PhoneActivity({ from, to }) {
  const [allCalls, setAllCalls] = useState(null);
  const { clients } = useClients();
  const { payments } = usePortfolio(clients);

  useEffect(() => {
    setAllCalls(null);
    // From CREDIT_DAYS before the period: a payment on its first days can follow an earlier call.
    const since = new Date(from.getTime() - CREDIT_DAYS * 864e5);
    getDocs(query(collection(db, "ringcentralCalls"), where("at", ">=", since.toISOString()), where("at", "<=", to.toISOString())))
      // Only calls matched to a client (numbers that are not a client's are kept but not counted).
      .then((s) => setAllCalls(s.docs.map((d) => d.data()).filter((c) => (c.clientIds || []).length)))
      .catch(() => setAllCalls([]));
  }, [from, to]);
  const calls = useMemo(() => (allCalls ? allCalls.filter((c) => c.at >= from.toISOString()) : null), [allCalls, from]);
  // Payment-plan payments in the period credited to the call before them (src/billing/callCredit.js).
  const credits = useMemo(() => {
    if (!allCalls) return new Map();
    const inPeriod = payments.filter((p) => p.date >= from && p.date <= to && p.amount > 0);
    return creditTotals(inPeriod, callsByClient(allCalls));
  }, [allCalls, payments, from, to]);

  const rows = useMemo(() => {
    if (!calls) return [];
    return TEAM.map((name) => {
      const mine = calls.filter((c) => c.by === name);
      const out = mine.filter((c) => c.direction === "outbound");
      const reached = out.filter((c) => c.connected);
      const inbound = mine.filter((c) => c.direction === "inbound");
      const talk = mine.reduce((s, c) => s + (c.connected ? Number(c.durationSec || 0) : 0), 0);
      const clients = new Set(mine.flatMap((c) => c.clientIds || []));
      return {
        name,
        outbound: out.length,
        reached: reached.length,
        rate: out.length ? reached.length / out.length : null,
        inbound: inbound.length,
        missedIn: inbound.filter((c) => c.missed).length,
        talk,
        avg: reached.length ? talk / Math.max(1, mine.filter((c) => c.connected).length) : 0,
        clients: clients.size,
        paidAfter: credits.get(name)?.count || 0,
        paidAfterAmount: credits.get(name)?.amount || 0,
      };
    });
  }, [calls, credits]);

  const any = calls && calls.length > 0;
  return (
    <Section title="Phone activity (RingCentral)" subtitle="Calls with clients by each billing team member in this period" pad={false} sx={{ mb: 3 }}>
      {calls === null && <LinearProgress />}
      {calls !== null && !any && (
        <Box sx={{ p: 2 }}>
          <Alert severity="info" variant="outlined">
            No RingCentral calls in this period yet. Calls appear here once the RingCentral connection is set up and the call import has run.
          </Alert>
        </Box>
      )}
      {any && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Person</TableCell>
                <TableCell align="right">Calls made</TableCell>
                <TableCell align="right">Answered</TableCell>
                <TableCell align="right">Answer rate</TableCell>
                <TableCell align="right">Calls received</TableCell>
                <TableCell align="right">Missed</TableCell>
                <TableCell align="right">Talk time</TableCell>
                <TableCell align="right">Avg call</TableCell>
                <TableCell align="right">Clients</TableCell>
                <TableCell align="right">Paid after a call</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{r.name}</TableCell>
                  <TableCell align="right">{r.outbound}</TableCell>
                  <TableCell align="right">{r.reached}</TableCell>
                  <TableCell align="right">{pct(r.rate)}</TableCell>
                  <TableCell align="right">{r.inbound}</TableCell>
                  <TableCell align="right" sx={{ color: r.missedIn ? "secondary.main" : "text.primary" }}>{r.missedIn}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{hm(r.talk)}</TableCell>
                  <TableCell align="right">{r.avg ? hm(r.avg) : "—"}</TableCell>
                  <TableCell align="right">{r.clients}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{r.paidAfter}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: r.paidAfterAmount ? "success.main" : "text.primary" }}>{money(r.paidAfterAmount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 2.25, py: 1.5 }}>
        Only calls with a client's phone number from MyCase, made or taken on the billing team's extensions (99159, 99140, 99211, 99088, 99031). "Answered" = talked 40 seconds or more (shorter "connected" calls are usually voicemail). "Missed" = a client's call rang this person and was not picked up. "Paid after a call" = payment-plan payments (initial payments left out) made the same day or up to {CREDIT_DAYS} days after this person talked with the client; when several people talked with them, the most recent call gets it. MyCase does not record who processed a payment, so this is the closest measure.
      </Typography>
    </Section>
  );
}
