// src/Dashboard/UpcomingPromisesList.jsx
import React, { useMemo, useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import { parseISO, format } from "date-fns";
import { Link } from "react-router-dom";

export default function UpcomingPromisesList({ clients = [], pageSize = 6 }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcoming = useMemo(() => {
    const arr = clients
      .filter((c) => c?.paymentPromise?.date)
      .map((c) => ({ ...c, _date: parseISO(c.paymentPromise.date) }))
      .filter((c) => c._date > today)
      .sort((a, b) => a._date - b._date);
    return arr;
  }, [clients]);

  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(upcoming.length / pageSize) || 1;

  const pageItems = upcoming.slice(page * pageSize, page * pageSize + pageSize);

  const handlePrev = () => setPage((p) => Math.max(0, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 1,
        boxShadow: "0 12px 28px rgba(16,24,40,0.06)",
        border: "1px solid rgba(0,0,0,0.04)",
        height: "100%",
      }}
    >
      <CardHeader
        title="Upcoming Promised Payments"
        titleTypographyProps={{ variant: "subtitle2", color: "text.secondary" }}
        action={
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton size="small" onClick={handlePrev} disabled={page === 0}>
              <ChevronLeftRounded />
            </IconButton>
            <Typography variant="caption" sx={{ minWidth: 56, textAlign: "center" }}>
              {page + 1} / {totalPages}
            </Typography>
            <IconButton
              size="small"
              onClick={handleNext}
              disabled={page >= totalPages - 1}
            >
              <ChevronRightRounded />
            </IconButton>
          </Stack>
        }
        sx={{ pb: 0.5 }}
      />
      <CardContent sx={{ pt: 1 }}>
        {pageItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No upcoming promises.
          </Typography>
        ) : (
          <List dense disablePadding>
            {pageItems.map((c) => {
              const pp = c.paymentPromise;
              const d = parseISO(pp.date);
              const primary =
                c.name || [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
              const secondary = `${format(d, "MMM d, yyyy")} • $${Number(
                pp.amount || 0
              ).toLocaleString()}`;

              return (
                <ListItem
                  key={c.id}
                  sx={{
                    px: 1,
                    py: 1,
                    borderRadius: 1,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                  secondaryAction={
                    <Chip size="small" label="Upcoming" color="success" />
                  }
                  component={Link}
                  to={`/client/${c.id}`}
                >
                  <ListItemText
                    primaryTypographyProps={{ fontWeight: 600 }}
                    primary={primary}
                    secondary={secondary}
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </CardContent>
    </Card>
  );
}
