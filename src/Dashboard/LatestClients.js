import React from "react";
import {
  Card, CardContent, CardHeader,
  List, ListItem, ListItemAvatar, Avatar, ListItemText, Divider, Typography
} from "@mui/material";

// Espera prop: items = [{ id, firstName, lastName, email }]
export default function LatestClients({ items = [] }) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: 2 }}>
      <CardHeader title="Latest clients" subheader={`${items.length} recent`} />
      <CardContent sx={{ pt: 0 }}>
        <List disablePadding>
          {items.map((c, idx) => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed";
            const email = c.email || "—";
            const initials =
              (c.firstName?.[0] || "").toUpperCase() + (c.lastName?.[0] || "").toUpperCase();
            return (
              <React.Fragment key={c.id || idx}>
                <ListItem sx={{ px: 0 }}>
                  <ListItemAvatar>
                    <Avatar>{initials || "?"}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<Typography variant="subtitle2">{name}</Typography>}
                    secondary={email}
                  />
                </ListItem>
                {idx < items.length - 1 && <Divider component="li" />}
              </React.Fragment>
            );
          })}
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No recent clients to show.
            </Typography>
          )}
        </List>
      </CardContent>
    </Card>
  );
}
