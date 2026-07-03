// src/Reports/ReportsPage.js
import React, { useEffect, useState } from "react";
import { Box, Tabs, Tab, Card, CardHeader, CardContent, Typography } from "@mui/material";
import { collection, getDocs } from "firebase/firestore";
import db from "../firebase";

import ARAgingReport from "./ARAgingReport";
import CollectionsReport from "./CollectionsReport";
import CohortReport from "./CohortReport";
import PaymentHistoryReport from "./PaymentHistoryReport";
import PaymentAllocationsReport from "./PaymentAllocationsReport";

function TabPanel({ value, index, children }) {
  if (value !== index) return null;
  return <Box sx={{ mt: 2 }}>{children}</Box>;
}

export default function ReportsPage() {
  const [tab, setTab] = useState(0);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Load clients once for Collections / Cohort / Payment Allocations
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "clients"));
        if (!mounted) return;
        setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load clients for reports:", e);
        setErr("Failed to load clients for reports.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1500, mx: "auto" }}>
      <Card sx={{ borderRadius: 1 }}>
        <CardHeader
          title="Collections Reports"
          subheader="Analyze receivables, cash collections, client cohorts, and payment allocations"
          sx={{
            "& .MuiCardHeader-title": { fontWeight: 700 },
            "& .MuiCardHeader-subheader": { color: "text.secondary" },
            pb: 0,
          }}
        />
        <CardContent>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab label="A/R Aging" />
            <Tab label="Collections" />
            <Tab label="Cohort Analysis" />
            <Tab label="Payment History" />
            <Tab label="Payment Allocations" />
          </Tabs>

          {loading && (
            <Typography sx={{ p: 2 }} color="text.secondary">
              Loading report data…
            </Typography>
          )}

          {err && !loading && (
            <Typography sx={{ p: 2 }} color="error">
              {err}
            </Typography>
          )}

          {!loading && !err && (
            <>
              <TabPanel value={tab} index={0}>
                <ARAgingReport />
              </TabPanel>

              <TabPanel value={tab} index={1}>
                <CollectionsReport clients={clients} />
              </TabPanel>

              <TabPanel value={tab} index={2}>
                <CohortReport clients={clients} loading={loading} />
              </TabPanel>

              <TabPanel value={tab} index={3}>
                <PaymentHistoryReport />
              </TabPanel>

              <TabPanel value={tab} index={4}>
                <PaymentAllocationsReport clients={clients} />
              </TabPanel>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}