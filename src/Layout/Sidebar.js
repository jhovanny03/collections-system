import React from "react";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from "@mui/material";
import { Link } from "react-router-dom";

const Sidebar = () => {
  const menuItems = [
    { text: "➕ Create Client", to: "/create-client" },
    { text: "📄 View Clients", to: "/clients" },
    { text: "📅 Promised Payments", to: "/promised-payments" },
    { text: "🔁 Follow Ups", to: "/follow-ups" },
    { text: "📊 Dashboard", to: "/" },
  ];

  return (
    <Drawer
      variant="permanent"
      anchor="left"
      sx={{ width: 240, flexShrink: 0 }}
    >
      <List sx={{ width: 240 }}>
        {menuItems.map((item) => (
          <ListItem key={item.to} disablePadding>
            <ListItemButton
              component={Link}
              to={item.to}
              sx={{
                borderRadius: 2,
                "&:hover": { bgcolor: "primary.light", color: "#fff" },
              }}
            >
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );
};

export default Sidebar;
