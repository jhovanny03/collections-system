// src/Layout/Layout.jsx
// App frame: sidebar + top bar (page name, client search, needs-attention bell, account).
import React, { useEffect, useMemo, useState } from "react";
import {
  AppBar, Toolbar, IconButton, Box, Menu, MenuItem, Avatar, useTheme, useMediaQuery, ListItemIcon,
  Badge, ListItemText, Divider, Typography, Autocomplete, TextField, InputAdornment, Chip, Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuRounded from "@mui/icons-material/MenuRounded";
import LogoutRounded from "@mui/icons-material/LogoutRounded";
import LightModeRounded from "@mui/icons-material/LightModeRounded";
import DarkModeRounded from "@mui/icons-material/DarkModeRounded";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import AccountCircleRounded from "@mui/icons-material/AccountCircleRounded";
import ManageAccountsRounded from "@mui/icons-material/ManageAccountsRounded";
import { useLocation, useNavigate, matchPath } from "react-router-dom";
import Sidebar from "./Sidebar";
import { useAuth } from "../auth/useAuth";
import { ROLE_LABELS } from "../auth/permissions";
import { IS_REBUILD_DATABASE, DATABASE_ID } from "../firebase";
import { useClients } from "../data/ClientsProvider";
import { useWorkQueue } from "../data/WorkQueueProvider";
import { BRAND } from "../theme/brand";

const SIDEBAR_KEY = "sidebar_open_v1";

const PAGES = [
  ["/dashboard", "Home"],
  ["/clients", "Clients"],
  ["/client/:id", "Client"],
  ["/follow-ups", "Follow-ups"],
  ["/promised-payments", "Promised payments"],
  ["/initial-payments", "Initial payments"],
  ["/case-setup", "Case Setup"],
  ["/mycase-review", "MyCase Review"],
  ["/reports", "Reports"],
  ["/team", "Team performance"],
  ["/admin/users", "Users & roles"],
  ["/register", "Add a user"],
  ["/profile", "My profile"],
  ["/create-client", "Create client"],
];

const clientName = (c) => `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unnamed client";

/** Things waiting on the team, from the shared work queue. */
function attentionItems(counts) {
  const items = [];
  const add = (n, title, subtitle, path, tone = "default") => n > 0 && items.push({ id: path + title, n, title, subtitle, path, tone });
  add(counts.promisesToday, "Promised payments due today", "Check they came in; call if not", "/promised-payments", "warning");
  add(counts.followUpsOpen, "Clients to follow up this month", "Were current and missed this month", "/follow-ups", "warning");
  add(counts.followUpsUnlogged, "Paid in MyCase, not logged", "Type these payments into Collections", "/follow-ups");
  add(counts.initialOpen, "Initial payments not completed", "Clients and new cases with the initial payment short", "/initial-payments", "warning");
  add(counts.newCases, "New MyCase cases to set up", "Case Setup › New MyCase cases", "/case-setup");
  add(counts.waitingPlan, "Clients waiting for a plan", "Welcome call and monthly invoice", "/case-setup");
  add(counts.reviewOpen, "MyCase payments to review", "The sync could not place them", "/mycase-review");
  add(counts.linkProblems, "Records with MyCase link problems", "Case Setup › Link problems", "/case-setup");
  return items;
}

export default function Layout({ children, mode, toggleColorMode }) {
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isEditorOrHigher, canManageUsers } = useAuth();
  const { clients } = useClients();
  const { counts } = useWorkQueue();
  const smallScreen = useMediaQuery(theme.breakpoints.down("md"));

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (smallScreen) return false;
    try {
      return localStorage.getItem(SIDEBAR_KEY) !== "0";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (smallScreen) setSidebarOpen(false);
  }, [smallScreen]);
  const toggleSidebar = () =>
    setSidebarOpen((o) => {
      if (!smallScreen) {
        try {
          localStorage.setItem(SIDEBAR_KEY, o ? "0" : "1");
        } catch {}
      }
      return !o;
    });

  const [accountEl, setAccountEl] = useState(null);
  const [bellEl, setBellEl] = useState(null);

  const pageTitle = useMemo(() => {
    const hit = PAGES.find(([p]) => matchPath({ path: p, end: true }, location.pathname));
    if (hit && hit[0] === "/client/:id") {
      const id = location.pathname.split("/")[2];
      const c = clients.find((x) => x.id === id);
      return c ? clientName(c) : "Client";
    }
    return hit ? hit[1] : "";
  }, [location.pathname, clients]);

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · Rahman Law Collections` : "Rahman Law Collections";
  }, [pageTitle]);

  const attention = isEditorOrHigher() ? attentionItems(counts) : [];
  const attentionTotal = attention.reduce((s, i) => s + i.n, 0);

  const searchOptions = useMemo(
    () =>
      clients
        .map((c) => ({ id: c.id, label: clientName(c), caseTitle: c.caseTitle || "", status: c.status || "active" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [clients]
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{ bgcolor: alpha(theme.palette.background.default, 0.88), backdropFilter: "blur(8px)", color: "text.primary", borderBottom: `1px solid ${theme.palette.divider}` }}
        >
          <Toolbar sx={{ gap: 1.5, minHeight: { xs: 60, md: 64 } }}>
            <IconButton edge="start" onClick={toggleSidebar} aria-label="Toggle menu">
              <MenuRounded />
            </IconButton>
            <Typography variant="h6" component="h1" noWrap sx={{ minWidth: 0, flexShrink: 1 }}>
              {pageTitle}
            </Typography>

            <Box sx={{ flexGrow: 1 }} />

            {/* Find a client from anywhere */}
            <Autocomplete
              size="small"
              options={searchOptions}
              getOptionLabel={(o) => o.label}
              filterOptions={(opts, { inputValue }) => {
                const q = inputValue.trim().toLowerCase();
                if (q.length < 2) return [];
                return opts.filter((o) => o.label.toLowerCase().includes(q) || o.caseTitle.toLowerCase().includes(q)).slice(0, 12);
              }}
              noOptionsText="Type at least 2 letters of a name or case"
              onChange={(_, o) => o && navigate(`/client/${o.id}`)}
              value={null}
              blurOnSelect
              clearOnBlur
              sx={{ width: { xs: 180, sm: 260, md: 340 } }}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{o.label}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {o.caseTitle || "—"} · {o.status}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Find a client…"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRounded fontSize="small" />
                      </InputAdornment>
                    ),
                    sx: { borderRadius: 5, bgcolor: "background.paper" },
                  }}
                />
              )}
            />

            {isEditorOrHigher() && (
              <Tooltip title="Needs attention">
                <IconButton onClick={(e) => setBellEl(e.currentTarget)} aria-label="Needs attention">
                  <Badge badgeContent={attentionTotal} color="secondary" max={999}>
                    <NotificationsRounded />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}

            <IconButton onClick={(e) => setAccountEl(e.currentTarget)} aria-label="Account" sx={{ p: 0.5 }}>
              <Avatar src={user?.profileImageURL} sx={{ width: 34, height: 34, bgcolor: BRAND.blue, fontSize: 14, fontWeight: 800 }}>
                {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
              </Avatar>
            </IconButton>
          </Toolbar>

          {IS_REBUILD_DATABASE && (
            <Box sx={{ px: 2, py: 0.5, bgcolor: BRAND.amberSoft, color: "#5C3A00", fontSize: 13, borderTop: "1px solid #F3D7A6" }}>
              <b>MyCase rebuild copy</b> ({DATABASE_ID}): payment history rebuilt from MyCase. The original data is untouched.
            </Box>
          )}
        </AppBar>

        {/* Account menu */}
        <Menu anchorEl={accountEl} open={!!accountEl} onClose={() => setAccountEl(null)} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography fontWeight={800}>{user?.name || user?.email}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">{user?.email}</Typography>
            <Chip size="small" label={ROLE_LABELS[user?.role] || user?.role} sx={{ mt: 0.75 }} />
          </Box>
          <Divider />
          <MenuItem onClick={() => { setAccountEl(null); navigate("/profile"); }}>
            <ListItemIcon><AccountCircleRounded fontSize="small" /></ListItemIcon>
            My profile
          </MenuItem>
          <MenuItem onClick={toggleColorMode}>
            <ListItemIcon>{mode === "light" ? <DarkModeRounded fontSize="small" /> : <LightModeRounded fontSize="small" />}</ListItemIcon>
            {mode === "light" ? "Dark mode" : "Light mode"}
          </MenuItem>
          {canManageUsers() && (
            <MenuItem onClick={() => { setAccountEl(null); navigate("/admin/users"); }}>
              <ListItemIcon><ManageAccountsRounded fontSize="small" /></ListItemIcon>
              Users & roles
            </MenuItem>
          )}
          <Divider />
          <MenuItem onClick={() => { setAccountEl(null); logout(); }}>
            <ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon>
            Sign out
          </MenuItem>
        </Menu>

        {/* Needs attention */}
        <Menu anchorEl={bellEl} open={!!bellEl} onClose={() => setBellEl(null)} slotProps={{ paper: { sx: { width: 380, maxWidth: "92vw" } } }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography fontWeight={800}>Needs attention</Typography>
            <Typography variant="caption" color="text.secondary">
              {attention.length ? "Updated every few minutes from Collections and MyCase" : "All caught up"}
            </Typography>
          </Box>
          <Divider />
          {attention.map((i) => (
            <MenuItem key={i.id} onClick={() => { setBellEl(null); navigate(i.path); }} sx={{ py: 1.25, whiteSpace: "normal" }}>
              <Box sx={{ minWidth: 44, mr: 1.5, textAlign: "center", fontWeight: 800, fontSize: 15, color: i.tone === "warning" ? "secondary.main" : "primary.main" }}>
                {i.n}
              </Box>
              <ListItemText primary={i.title} secondary={i.subtitle} primaryTypographyProps={{ fontWeight: 700, fontSize: 14 }} />
            </MenuItem>
          ))}
        </Menu>

        <Box sx={{ flex: 1, width: "100%", maxWidth: 1600, mx: "auto", px: { xs: 1.5, sm: 2.5, md: 3.5 }, py: { xs: 2, md: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
