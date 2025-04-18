// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ClientList from './ClientList';
import CreateClient from './CreateClient';
import ClientDashboard from './ClientDashboard/ClientDashboard';
import PromisedPaymentCalendar from './PromisedPaymentCalendar'; // ✅ NEW IMPORT

function MainView() {
  const [view, setView] = useState('create');

  return (
    <div className="App" style={{ padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <button onClick={() => setView('create')} style={buttonStyle}>➕ Create Client</button>
        <button onClick={() => setView('view')} style={buttonStyle}>📄 View Clients</button>
        <a href="/promised-payments" style={{ ...buttonStyle, textDecoration: 'none' }}>📅 Promised Payments</a> {/* ✅ LINK */}
      </div>
      {view === 'create' && <CreateClient />}
      {view === 'view' && <ClientList />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainView />} />
        <Route path="/client/:clientId" element={<ClientDashboard />} />
        <Route path="/promised-payments" element={<PromisedPaymentCalendar />} /> {/* ✅ NEW ROUTE */}
      </Routes>
    </Router>
  );
}

const buttonStyle = {
  marginRight: '1rem',
  padding: '0.6rem 1.2rem',
  borderRadius: '4px',
  border: '1px solid #ccc',
  backgroundColor: '#f8f8f8',
  cursor: 'pointer'
};

export default App;
