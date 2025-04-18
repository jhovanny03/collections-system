import React, { useEffect, useState } from 'react';
import db from './firebase';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import EditClient from './EditClient';
import ReportingSummary from './ReportingSummary';

function ClientList() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClient, setEditingClient] = useState(null);
  const [refresh, setRefresh] = useState(false);
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [clientsPerPage, setClientsPerPage] = useState(10);

  useEffect(() => {
    fetchClients();
  }, [refresh]);

  const fetchClients = async () => {
    const querySnapshot = await getDocs(collection(db, 'clients'));
    const clientList = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setClients(clientList);
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this client?")) {
      await deleteDoc(doc(db, "clients", id));
      setClients(clients.filter(client => client.id !== id));
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
  };

  const sortedClients = () => {
    let filtered = [...clients];

    if (search.trim()) {
      filtered = filtered.filter(
        client =>
          client.firstName?.toLowerCase().includes(search.toLowerCase()) ||
          client.lastName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'amountDue') {
          aVal = parseFloat(aVal) || 0;
          bVal = parseFloat(bVal) || 0;
        } else {
          aVal = aVal?.toString().toLowerCase() || '';
          bVal = bVal?.toString().toLowerCase() || '';
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  };

  const paginatedClients = () => {
    const sorted = sortedClients();
    const startIndex = (currentPage - 1) * clientsPerPage;
    return sorted.slice(startIndex, startIndex + clientsPerPage).map(client => {
      const monthlyInstallment = client.installmentAmount || 500;

      let startDate = null;
      const raw = client.firstInstallmentDate;

      if (raw?.seconds) {
        startDate = new Date(raw.seconds * 1000);
      } else if (typeof raw === 'string' || raw instanceof String) {
        startDate = new Date(raw);
      }

      if (!startDate || isNaN(startDate)) {
        return {
          ...client,
          computedAmountDue: 0,
          computedPastDueLabel: "-"
        };
      }

      const today = new Date();
      const payments = (client.payments || []).filter(p => new Date(p.date) >= startDate);
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

      const monthsSinceStart = Math.floor(
        (today.getFullYear() - startDate.getFullYear()) * 12 +
        (today.getMonth() - startDate.getMonth()) + 1
      );

      const paidMonths = Math.floor(totalPaid / monthlyInstallment);
      const missedMonths = Math.max(0, monthsSinceStart - paidMonths);
      const amountDue = missedMonths * monthlyInstallment;

      const startMonth = new Date(startDate);
      const endMonth = new Date(startDate);
      endMonth.setMonth(startMonth.getMonth() + missedMonths - 1);

      const pastDueLabel = missedMonths === 0
        ? <span style={tagGreen}>Current</span>
        : `${startMonth.toLocaleString('default', { month: 'long' })} ${startMonth.getFullYear()} – ${endMonth.toLocaleString('default', { month: 'long' })} ${endMonth.getFullYear()}`;

      return {
        ...client,
        computedAmountDue: amountDue,
        computedPastDueLabel: pastDueLabel
      };
    });
  };

  const totalPages = Math.ceil(sortedClients().length / clientsPerPage);

  const requestSort = key => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  if (loading) return <p>Loading clients...</p>;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: 'auto' }}>
      <ReportingSummary />

      <h2>Client List</h2>

      <div style={{ position: 'relative', display: 'inline-block', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '8px 30px 8px 8px',
            width: '300px',
            fontSize: '16px'
          }}
        />
        {search && (
          <span
            onClick={() => setSearch('')}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'pointer',
              color: '#999',
              fontWeight: 'bold',
              fontSize: '18px',
              userSelect: 'none'
            }}
          >
            ×
          </span>
        )}
      </div>

      {editingClient && (
        <EditClient
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSave={() => setRefresh(!refresh)}
        />
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th} onClick={() => requestSort('firstName')}>Name{getSortIndicator('firstName')}</th>
            <th style={th}>Case Type</th>
            <th style={th} onClick={() => requestSort('caseStatus')}>Case Status{getSortIndicator('caseStatus')}</th>
            <th style={th}>MyCase Link</th>
            <th style={th}>Amount Due</th>
            <th style={th}>Months Past Due</th>
            <th style={th}>Last Payment Date</th>
            <th style={th}>Payment Notes</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedClients().map(client => (
            <tr key={client.id}>
              <td style={td}>
                <a href={`/client/${client.id}`} style={{ color: '#007bff', textDecoration: 'underline', cursor: 'pointer' }}>
                  {client.firstName} {client.lastName}
                </a>
                {client.paymentArrangement && (
                  <span style={{ backgroundColor: '#e0f0ff', color: '#007bff', marginLeft: '6px', padding: '2px 6px', fontSize: '12px', borderRadius: '4px' }}>
                    On Arrangement
                  </span>
                )}
              </td>
              <td style={td}>{client.caseType || '-'}</td>
              <td style={td}>{client.caseStatus || '-'}</td>
              <td style={td}><a href={client.myCaseLink} target="_blank" rel="noreferrer">View</a></td>
              <td style={td}>${(client.computedAmountDue || 0).toLocaleString()}</td>
              <td style={td}>{client.computedPastDueLabel}</td>
              <td style={td}>{client.lastPaymentDate || '-'}</td>
              <td style={td}>{client.paymentNotes || '-'}</td>
              <td style={td}>
                <button onClick={() => handleEdit(client)} style={actionBtn}>Edit</button>
                <button
                  onClick={() => handleDelete(client.id)}
                  style={{ ...actionBtn, backgroundColor: '#dc3545', color: '#fff' }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} style={navBtn}>Previous</button>
          <span style={{ margin: '0 10px' }}>Page {currentPage} of {totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} style={navBtn}>Next</button>
        </div>
      )}
    </div>
  );
}

const th = {
  borderBottom: '1px solid #ccc',
  padding: '8px',
  textAlign: 'left',
  cursor: 'pointer'
};

const td = {
  borderBottom: '1px solid #eee',
  padding: '8px'
};

const actionBtn = {
  marginRight: '0.5rem',
  padding: '4px 8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#007bff',
  color: '#fff',
  cursor: 'pointer'
};

const navBtn = {
  padding: '6px 12px',
  backgroundColor: '#007bff',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  margin: '0 5px'
};

const tagGreen = {
  backgroundColor: '#28a745',
  color: '#fff',
  padding: '2px 8px',
  borderRadius: '4px',
  fontSize: '13px',
  fontWeight: '500'
};

export default ClientList;
