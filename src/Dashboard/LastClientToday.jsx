import * as React from "react";
import DashboardCard from "./DashboardCard";
import {
  List, ListItem, ListItemAvatar, Avatar, ListItemText,
  Stack, Typography,
} from "@mui/material";
import PersonRounded from "@mui/icons-material/PersonRounded";

// Utilidad: convertir posibles formatos de fecha a Date
const toDate = (v) => {
  if (!v) return null;
  if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

function latestActivityForClient(c) { // CHANGED
  const today = new Date();

  const lastChange = toDate(c.lastChangeAt);
  const updated = toDate(c.updatedAt);
  const created = toDate(c.createdAt);

  const when = lastChange || updated || created;
  if (!when) return null;
  if (!isSameDay(when, today)) return null;

  const activity =
    c.lastActivity ||
    (lastChange && updated && lastChange >= updated ? "edited" : null) ||
    (updated && created && updated > created ? "edited" : "created");

  const subtitle =
    activity === "edited"
      ? `Edited on ${when.toLocaleDateString()}`
      : `Created on ${when.toLocaleDateString()}`;

  return { when, subtitle };
}

export default function LastClientToday({ clients = [], limit = 5 }) {
  const items = clients
    .map((c) => {
      const last = latestActivityForClient(c);
      return last
        ? {
            id: c.id,
            name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unnamed client",
            subtitle: last.subtitle,
            when: last.when,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.when - a.when)
    .slice(0, limit);

  return (
    <DashboardCard title="Last Client Today">
      {items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No updates today.
        </Typography>
      ) : (
        <List sx={{ py: 0 }}>
          {items.map((it) => (
            <ListItem key={it.id} sx={{ px: 0 }}>
              <ListItemAvatar>
                <Avatar>
                  <PersonRounded />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {it.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {it.when.toLocaleDateString()}
                    </Typography>
                  </Stack>
                }
                secondary={<Typography variant="body2">{it.subtitle}</Typography>}
              />
            </ListItem>
          ))}
        </List>
      )}
    </DashboardCard>
  );
}
