// src/ClientDashboard/CommunicationLog.js
import React, { useMemo, useState } from "react";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import db from "../firebase";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Collapse,
  Divider,
  Stack,
  Chip,
} from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";

// 🎨 Brand colors
const FEDERAL_BLUE = "#0b3a75";
const PERSIAN_GREEN = "#00a693";

// Helper to format "2025-01" → "January 2025"
function formatMonthLabel(key) {
  const [year, month] = key.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function CommunicationLog({ client, setClient }) {
  const [logEntry, setLogEntry] = useState("");
  const clientId = client?.id;

  // 🔹 Sort logs (newest first) & group by month
  const { groupedLogs, monthOrder } = useMemo(() => {
    const logs = [...(client.communicationLogs || [])];

    logs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const groups = {};
    for (const log of logs) {
      const d = new Date(log.timestamp);
      if (Number.isNaN(d.getTime())) continue;

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    }

    const order = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)); // newest month first
    return { groupedLogs: groups, monthOrder: order };
  }, [client.communicationLogs]);

  // 🔹 Open the most recent month by default
  const [openMonths, setOpenMonths] = useState(() => {
    if (monthOrder.length === 0) return {};
    return { [monthOrder[0]]: true };
  });

  const toggleMonth = (key) => {
    setOpenMonths((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddLog = async () => {
    if (!logEntry.trim()) return;
    if (!clientId) return;

    const auth = getAuth();
    const user = auth.currentUser;

    const newLog = {
      message: logEntry.trim(),
      timestamp: new Date().toISOString(),
      user: user?.displayName || user?.email || "Anonymous",
    };

    const clientRef = doc(db, "clients", clientId);
    await updateDoc(clientRef, {
      communicationLogs: arrayUnion(newLog),
    });

    setClient((prev) => ({
      ...prev,
      communicationLogs: [...(prev.communicationLogs || []), newLog],
    }));

    setLogEntry("");
  };

  return (
    <Box sx={{ mb: 4 }}>
      {/* Header */}
      <Box
        sx={{
          mb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Typography
          variant="h6"
          sx={{ fontWeight: 700, color: FEDERAL_BLUE, display: "flex", gap: 1 }}
        >
          📝 Communication Log
        </Typography>

        <Chip
          size="small"
          label={`${client.communicationLogs?.length || 0} entries`}
          sx={{
            bgcolor: "rgba(11,58,117,0.08)",
            color: FEDERAL_BLUE,
            fontWeight: 500,
          }}
        />
      </Box>

      {/* Scrollable log area */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          borderColor: "rgba(148,163,184,0.5)",
          mb: 2,
          maxHeight: 420,
          overflowY: "auto",
        }}
      >
        <CardContent sx={{ pb: 1.5 }}>
          {monthOrder.length === 0 && (
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontStyle: "italic" }}
            >
              No communication logs recorded yet.
            </Typography>
          )}

          {monthOrder.map((monthKey) => {
            const logs = groupedLogs[monthKey] || [];
            const isOpen = !!openMonths[monthKey];
            const monthLabel = formatMonthLabel(monthKey);

            return (
              <Box key={monthKey} sx={{ mb: 1.5 }}>
                {/* Month header */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    py: 0.75,
                  }}
                  onClick={() => toggleMonth(monthKey)}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontWeight: 700,
                      color: FEDERAL_BLUE,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    {monthLabel}
                  </Typography>

                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontWeight: 500 }}
                  >
                    {logs.length} log{logs.length !== 1 ? "s" : ""}
                  </Typography>
                </Box>

                <Collapse in={isOpen} timeout="auto" unmountOnExit>
                  <Divider sx={{ mb: 1 }} />
                  <Stack spacing={1.2}>
                    {logs.map((log, index) => (
                      <Card
                        key={`${log.timestamp}-${index}`}
                        variant="outlined"
                        sx={{
                          borderRadius: 1.5,
                          borderColor: "rgba(148,163,184,0.4)",
                          boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
                        }}
                      >
                        <Box
                          sx={{
                            px: 1.5,
                            py: 0.75,
                            bgcolor: "rgba(15,23,42,0.02)",
                            borderBottom: "1px solid rgba(148,163,184,0.25)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ color: "text.secondary" }}
                          >
                            {new Date(log.timestamp).toLocaleString()}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: PERSIAN_GREEN, fontWeight: 600 }}
                          >
                            {log.user}
                          </Typography>
                        </Box>
                        <Box sx={{ px: 1.5, py: 1.25 }}>
                          <Typography
                            variant="body2"
                            sx={{ color: "text.primary", whiteSpace: "pre-wrap" }}
                          >
                            {log.message}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </CardContent>
      </Card>

      {/* Add new log */}
      <Card
        variant="outlined"
        sx={{
          borderRadius: 2,
          borderColor: "rgba(148,163,184,0.5)",
          bgcolor: "#f9fafb",
        }}
      >
        <CardContent sx={{ p: 2.5 }}>
          <Typography
            variant="subtitle2"
            sx={{ mb: 1, fontWeight: 700, color: FEDERAL_BLUE }}
          >
            Add new communication log
          </Typography>
          <TextField
            value={logEntry}
            onChange={(e) => setLogEntry(e.target.value)}
            multiline
            minRows={3}
            placeholder="Ex: Spoke with client about missed payment, confirmed promise for next Friday..."
            fullWidth
            variant="outlined"
            sx={{
              mb: 1.5,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#ffffff",
              },
            }}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              onClick={handleAddLog}
              variant="contained"
              disabled={!logEntry.trim()}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                bgcolor: PERSIAN_GREEN,
                "&:hover": { bgcolor: "#00877c" },
              }}
            >
              Submit Log
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}