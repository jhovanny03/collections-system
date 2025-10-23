// src/Layout/Layout.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Toolbar,
  IconButton,
  Box,
  Menu,
  MenuItem,
  Avatar,
  useTheme,
  ListItemIcon,
  Badge,
  ListItemText,
  Divider,
  Breadcrumbs,
  Link as MuiLink,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Logout as LogoutIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  Notifications as NotificationsIcon,
} from "@mui/icons-material";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import ManageAccountsRounded from "@mui/icons-material/ManageAccountsRounded";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../auth/useAuth";
import { canManageUsers } from "../auth/permissions";
import { alpha } from "@mui/material/styles";

// Notifications utils
import {
  promisesDueToday,
  countOutstandingFollowUps,
  startOfDay,
} from "../utils/notifications";

export default function Layout({ children, mode, toggleColorMode, clients = [] }) {
  const theme = useTheme();
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifMenuEl, setNotifMenuEl] = useState(null);
  const [notifItems, setNotifItems] = useState([]);

  const toggleSidebar = () => setSidebarOpen((o) => !o);
  const openMenu = (e) => setAnchorEl(e.currentTarget);
  const closeMenu = () => setAnchorEl(null);

  const openNotif = (e) => setNotifMenuEl(e.currentTarget);
  const closeNotif = () => setNotifMenuEl(null);

  // ----- Notifications -----
  const readKey = useMemo(
    () => (user?.uid ? `notif_read_${user.uid}` : "notif_read_anonymous"),
    [user?.uid]
  );
  const getReadSet = () => {
    try {
      const raw = localStorage.getItem(readKey);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr);
    } catch {
      return new Set();
    }
  };
  const setReadSet = (set) => {
    localStorage.setItem(readKey, JSON.stringify(Array.from(set)));
  };

  useEffect(() => {
    const today = startOfDay(new Date());
    const items = [];

    const fuCount = countOutstandingFollowUps(clients, today);
    if (fuCount > 0) {
      items.push({
        id: `followups_${today.toDateString()}`,
        title: `${fuCount} client${fuCount > 1 ? "s" : ""} need follow-ups`,
        subtitle: "Window 15→15 • Open follow-ups",
        path: "/follow-ups",
      });
    }

    const dueToday = promisesDueToday(clients, today);
    for (const c of dueToday) {
      const name =
        c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unnamed client";
      items.push({
        id: `promise_${c.id}_${today.toDateString()}`,
        title: "Promised payment due today",
        subtitle: name,
        path: `/client/${c.id}`,
        altPath: "/promised-payments",
      });
    }

    setNotifItems(items);
    const read = getReadSet();
    const notRead = items.filter((i) => !read.has(i.id)).length;
    setUnreadCount(notRead);
  }, [clients, readKey]);

  const markOneRead = (id) => {
    const read = getReadSet();
    if (!read.has(id)) {
      read.add(id);
      setReadSet(read);
      setUnreadCount((n) => Math.max(0, n - 1));
    }
  };
  const markAllRead = () => {
    const read = getReadSet();
    notifItems.forEach((i) => read.add(i.id));
    setReadSet(read);
    setUnreadCount(0);
  };
  const handleOpenNotification = (item) => {
    markOneRead(item.id);
    closeNotif();
    navigate(item.path);
  };

  // ----- Breadcrumb helpers -----
  const pathnames = location.pathname.split("/").filter(Boolean);
  const formatTitle = (segment) =>
    segment
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const labelForCrumb = (segment, idx) => {
    const prev = pathnames[idx - 1];
    if (prev === "client") {
      const match = clients.find((c) => c.id === segment);
      if (match) {
        const name = `${match.firstName || ""} ${match.lastName || ""}`.trim();
        if (name) return name;
      }
      return segment;
    }
    return formatTitle(segment);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />

      <Box component="main" sx={{ flexGrow: 1 }}>
        {/* AppBar — transparent */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            background: "transparent",
            color: theme.palette.text.primary,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          }}
        >
          <Toolbar>
            <IconButton edge="start" onClick={toggleSidebar}>
              <MenuIcon />
            </IconButton>

            <Box sx={{ flexGrow: 1 }} />

            {/* Notifications */}
            <IconButton sx={{ ml: 1 }} onClick={openNotif}>
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>

            {/* Avatar menu */}
            <IconButton onClick={openMenu} sx={{ ml: 1 }}>
              <Avatar
                src={user?.profileImageURL}
                sx={{
                  width: 32,
                  height: 32,
                  border: `2px solid ${alpha(theme.palette.text.primary, 0.15)}`,
                }}
              />
            </IconButton>

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
              <MenuItem disabled>{user?.email}</MenuItem>
              <MenuItem
                onClick={() => {
                  closeMenu();
                  navigate("/profile");
                }}
              >
                <ListItemIcon>
                  <AccountCircleRounded fontSize="small" />
                </ListItemIcon>
                Profile
              </MenuItem>
              <MenuItem onClick={toggleColorMode}>
                <ListItemIcon>
                  {mode === "light" ? (
                    <DarkModeIcon fontSize="small" />
                  ) : (
                    <LightModeIcon fontSize="small" />
                  )}
                </ListItemIcon>
                {mode === "light" ? "Dark Mode" : "Light Mode"}
              </MenuItem>
              {canManageUsers(user) && (
                <MenuItem
                  onClick={() => {
                    closeMenu();
                    navigate("/admin/users");
                  }}
                >
                  <ListItemIcon>
                    <ManageAccountsRounded fontSize="small" />
                  </ListItemIcon>
                  Manage Users
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  closeMenu();
                  logout();
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>

            {/* Notifications menu */}
            <Menu
              anchorEl={notifMenuEl}
              open={Boolean(notifMenuEl)}
              onClose={closeNotif}
              slotProps={{ paper: { sx: { width: 360, maxWidth: "90vw" } } }}
            >
              <MenuItem disabled>
                <ListItemIcon>
                  <NotificationsIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Notifications"
                  secondary={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
                />
              </MenuItem>
              <Divider />
              {notifItems.length === 0 && <MenuItem disabled>No notifications</MenuItem>}
              {notifItems.map((n) => (
                <MenuItem key={n.id} onClick={() => handleOpenNotification(n)}>
                  <ListItemText primary={n.title} secondary={n.subtitle} />
                </MenuItem>
              ))}
              {notifItems.length > 0 && (
                <>
                  <Divider />
                  <MenuItem onClick={markAllRead}>
                    <ListItemIcon>
                      <DoneAllIcon fontSize="small" />
                    </ListItemIcon>
                    Mark all as read
                  </MenuItem>
                </>
              )}
            </Menu>
          </Toolbar>

          {/* Breadcrumbs bar — now fully transparent */}
          <Box
            px={2}
            py={1}
            sx={{
              backgroundColor: "transparent",
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <Breadcrumbs>
              <MuiLink component={Link} to="/">
                Home
              </MuiLink>
              {pathnames.map((segment, idx) => {
                const to = `/${pathnames.slice(0, idx + 1).join("/")}`;
                const label = labelForCrumb(segment, idx);
                return (
                  <MuiLink key={to} component={Link} to={to} color="text.secondary">
                    {label}
                  </MuiLink>
                );
              })}
            </Breadcrumbs>
          </Box>
        </AppBar>

        {/* Content */}
        <Box sx={{ p: 2 }}>{children}</Box>
      </Box>
    </Box>
  );
}