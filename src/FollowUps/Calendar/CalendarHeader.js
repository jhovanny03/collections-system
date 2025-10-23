// src/FollowUps/Calendar/CalendarHeader.js
import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Menu,
  MenuItem,
  Checkbox,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import FilterListIcon from '@mui/icons-material/FilterList';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CalendarViewDayIcon from '@mui/icons-material/CalendarViewDay';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import CalendarViewMonthIcon from '@mui/icons-material/CalendarViewMonth';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useCalendar } from './CalendarContext';
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns';

export default function CalendarHeader() {
  const theme = useTheme();
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'));
  const {
    view,
    setView,
    currentDate,
    setCurrentDate,
    agendaMode,
    toggleAgendaMode,
    use24HourFormat,
    toggleTimeFormat,
    selectedColors,
    filterByColors,
    dotBadge,
    toggleDotBadge,
    addEvent,
  } = useCalendar();

  const [anchorFilter, setAnchorFilter] = useState(null);
  const [anchorSettings, setAnchorSettings] = useState(null);

  const colorOptions = [
    { name: '1st Attempt', color: theme.palette.primary.main },
    { name: '2nd Attempt', color: theme.palette.primary.main },
    { name: '3rd Attempt', color: theme.palette.primary.dark },
    { name: '4th Attempt', color: theme.palette.warning.main },
    { name: '5th Attempt', color: theme.palette.error.main },
    { name: 'Success', color: theme.palette.success.main },
  ];

  const prevPeriod = () => {
    switch (view) {
      case 'year':  setCurrentDate(d => addYears(d, -1)); break;
      case 'month': setCurrentDate(d => addMonths(d, -1)); break;
      case 'week':  setCurrentDate(d => addWeeks(d, -1));  break;
      case 'day':   setCurrentDate(d => addDays(d, -1));   break;
      default: break;
    }
  };
  const nextPeriod = () => {
    switch (view) {
      case 'year':  setCurrentDate(d => addYears(d,  1)); break;
      case 'month': setCurrentDate(d => addMonths(d,  1)); break;
      case 'week':  setCurrentDate(d => addWeeks(d,   1)); break;
      case 'day':   setCurrentDate(d => addDays(d,    1)); break;
      default: break;
    }
  };
  const goToToday = () => setCurrentDate(new Date());
  const handleFilterOpen = e => setAnchorFilter(e.currentTarget);
  const handleFilterClose = () => setAnchorFilter(null);
  const handleSettingsOpen = e => setAnchorSettings(e.currentTarget);
  const handleSettingsClose = () => setAnchorSettings(null);

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      mb={2}
      flexWrap={isSmall ? 'wrap' : 'nowrap'}
    >
      {/* Prev / Title / Next / Today */}
      <Box display="flex" alignItems="center">
        <IconButton onClick={prevPeriod}><ChevronLeftIcon/></IconButton>
        <Typography variant="h6" mx={1}>
          {format(
            currentDate,
            view === 'year'   ? 'yyyy'
          : view === 'month'  ? 'MMMM yyyy'
          : view === 'week'   ? "'Week of' MMM d, yyyy"
          :                       "'Day' MMM d, yyyy"
          )}
        </Typography>
        <IconButton onClick={nextPeriod}><ChevronRightIcon/></IconButton>
        <IconButton onClick={goToToday}><CalendarTodayIcon/></IconButton>
      </Box>

      {/* Actions */}
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={handleFilterOpen}><FilterListIcon/></IconButton>
        <IconButton onClick={toggleTimeFormat}>
          <AccessTimeIcon/>
          <Typography variant="caption" ml={0.5}>
            {use24HourFormat ? '24h' : '12h'}
          </Typography>
        </IconButton>

        {/* View Selector including new Agenda icon next to Year */}
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(e, val) => val && setView(val)}
          size="small"
          aria-label="View selector"
        >
          <ToggleButton value="day"><CalendarViewDayIcon/></ToggleButton>
          <ToggleButton value="week"><CalendarViewWeekIcon/></ToggleButton>
          <ToggleButton value="month"><CalendarViewMonthIcon/></ToggleButton>
          <ToggleButton value="year"><CalendarMonthIcon/></ToggleButton>
          <ToggleButton value="agenda"><FormatListBulletedIcon/></ToggleButton>
        </ToggleButtonGroup>

        <Button
          variant="contained"
          startIcon={<AddIcon/>}
          onClick={() => addEvent({
            title: '',
            start: new Date(),
            end: new Date(),
            color: theme.palette.primary.main,
          })}
        >
          Add Event
        </Button>

        <IconButton onClick={handleSettingsOpen}><SettingsIcon/></IconButton>
      </Box>

      {/* Filter Menu */}
      <Menu anchorEl={anchorFilter} open={Boolean(anchorFilter)} onClose={handleFilterClose}>
        {colorOptions.map(opt => (
          <MenuItem key={opt.name} onClick={() => {
            const newCols = selectedColors.includes(opt.name)
              ? selectedColors.filter(c => c !== opt.name)
              : [...selectedColors, opt.name];
            filterByColors(newCols);
          }}>
            <Checkbox checked={selectedColors.includes(opt.name)} size="small" sx={{display: 'none'}}/>
            <ListItemIcon>
              <Box sx={{ width:12, height:12, bgcolor:opt.color, borderRadius:'50%' }}/>
            </ListItemIcon>
            <ListItemText primary={opt.name}/>
          </MenuItem>
        ))}
      </Menu>

      {/* Settings Menu */}
      <Menu anchorEl={anchorSettings} open={Boolean(anchorSettings)} onClose={handleSettingsClose}>
        <MenuItem>
          <ListItemIcon><Checkbox checked={dotBadge} onChange={toggleDotBadge}/></ListItemIcon>
          <ListItemText primary="Use dot badge"/>
        </MenuItem>
        <Divider/>
        <Typography variant="subtitle2" sx={{ px:2, pt:1 }}>Default view</Typography>
        {['day','week','month','year','agenda'].map(v => (
          <MenuItem
            key={v}
            selected={view === v}
            onClick={() => { setView(v); handleSettingsClose(); }}
          >
            <ListItemText primary={v.charAt(0).toUpperCase() + v.slice(1)}/>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
