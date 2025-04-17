import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import db from './firebase';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

function EditClient({ client, onClose, onSave }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    myCaseLink: '',
    caseType: '',
    caseStatus: 'Active',
    amountDue: '',
    monthsPastDue: '',
    lastPaymentDate: '',
    paymentNotes: ''
  });

  const [startMonth, setStartMonth] = useState(null);
  const [endMonth, setEndMonth] = useState(null);

  useEffect(() => {
    if (client) {
      setForm({
        ...client,
        lastPaymentDate: client.lastPaymentDate ? new Date(client.lastPaymentDate) : '',
      });

      // Pre-populate monthsPastDue as date range
      if (client.monthsPastDue && client.monthsPastDue.includes('–')) {
        const [startStr, endStr] = client.monthsPastDue.split('–').map(s => s.trim());
        const parseMonth = str => {
          const [month, year] = str.split(' ');
          return new Date(`${month} 1, ${year}`);
        };
        setStartMonth(parseMonth(startStr));
        setEndMonth(parseMonth(endStr));
      }
    }
  }, [client]);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();

    // Format the months range
    let formattedRange = '';
    if (startMonth && endMonth) {
      const startFormatted = `${startMonth.toLocaleString('default', { month: 'long' })} ${startMonth.getFullYear()}`;
      const endFormatted = `${endMonth.toLocaleString('default', { month: 'long' })} ${endMonth.getFullYear()}`;
      formattedRange = `${startFormatted} – ${endFormatted}`;
    }

    const updatedData = {
      ...form,
      lastPaymentDate: form.lastPaymentDate ? form.lastPaymentDate.toISOString().split('T')[0] : '',
      monthsPastDue: formattedRange
    };

    try {
      const docRef = doc(db, 'clients', client.id);
      await updateDoc(docRef, updatedData);
      alert('Client updated successfully ✅');
      onSave();
      onClose();
    } catch (err) {
      console.error('Error updating client:', err);
      alert('Error updating client ❌');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Edit Client</h2>
      <form onSubmit={handleSubmit}>
        <input name="firstName" value={form.firstName} onChange={handleChange} placeholder="First Name" required />
        <br />
        <input name="lastName" value={form.lastName} onChange={handleChange} placeholder="Last Name" required />
        <br />
        <input name="myCaseLink" value={form.myCaseLink} onChange={handleChange} placeholder="MyCase Link" />
        <br />
        <input name="caseType" value={form.caseType} onChange={handleChange} placeholder="Case Type" />
        <br />
        <select name="caseStatus" value={form.caseStatus} onChange={handleChange}>
          <option value="Active">Active</option>
          <option value="Filed">Filed</option>
        </select>
        <br />
        <input name="amountDue" value={form.amountDue} onChange={handleChange} placeholder="Amount Due ($)" />
        <br />
        
        <label>Months Past Due:</label>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <DatePicker
            selected={startMonth}
            onChange={date => setStartMonth(date)}
            dateFormat="MMMM yyyy"
            showMonthYearPicker
            placeholderText="Start Month"
          />
          <DatePicker
            selected={endMonth}
            onChange={date => setEndMonth(date)}
            dateFormat="MMMM yyyy"
            showMonthYearPicker
            placeholderText="End Month"
          />
        </div>

        <label>Last Payment Date:</label>
        <br />
        <DatePicker
          selected={form.lastPaymentDate}
          onChange={date => setForm(prev => ({ ...prev, lastPaymentDate: date }))}
          dateFormat="yyyy-MM-dd"
          placeholderText="Select payment date"
        />
        <br />
        <textarea
          name="paymentNotes"
          value={form.paymentNotes}
          onChange={handleChange}
          placeholder="Payment Notes"
        />
        <br />

        <button type="submit">Save Changes</button>
        <button type="button" onClick={onClose} style={{ marginLeft: '1rem' }}>Cancel</button>
      </form>
    </div>
  );
}

export default EditClient;
