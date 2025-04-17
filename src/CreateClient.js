import React, { useState } from 'react';
import db from './firebase';
import { collection, addDoc } from 'firebase/firestore';

function CreateClient({ onClientCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [myCaseLink, setMyCaseLink] = useState('');
  const [caseType, setCaseType] = useState('');
  const [caseStatus, setCaseStatus] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    const newClient = {
      firstName,
      lastName,
      myCaseLink,
      caseType,
      caseStatus,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'clients'), newClient);
      if (onClientCreated) onClientCreated();
      setFirstName('');
      setLastName('');
      setMyCaseLink('');
      setCaseType('');
      setCaseStatus('');
    } catch (error) {
      console.error('Error adding client:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: 'auto' }}>
      <h2>Create Client</h2>
      <input
        type="text"
        placeholder="First Name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        required
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="Last Name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        required
        style={inputStyle}
      />
      <input
        type="text"
        placeholder="MyCase Link"
        value={myCaseLink}
        onChange={(e) => setMyCaseLink(e.target.value)}
        required
        style={inputStyle}
      />
      <select
        value={caseType}
        onChange={(e) => setCaseType(e.target.value)}
        required
        style={inputStyle}
      >
        <option value="">Select Case Type</option>
        <option value="VAWA SPOUSE">VAWA SPOUSE</option>
        <option value="PARENT VAWA">PARENT VAWA</option>
        <option value="CHILD VAWA">CHILD VAWA</option>
        <option value="T VISA">T VISA</option>
        <option value="U VISA">U VISA</option>
        <option value="MARRIAGE AOS">MARRIAGE AOS</option>
        <option value="N400">N400</option>
        <option value="I751 REGULAR">I751 REGULAR</option>
        <option value="I751 ECB">I751 ECB</option>
        <option value="I90">I90</option>
        <option value="ASYLUM">ASYLUM</option>
      </select>
      <select
        value={caseStatus}
        onChange={(e) => setCaseStatus(e.target.value)}
        required
        style={inputStyle}
      >
        <option value="">Select Case Stage</option>
        <option value="ACTIVE">ACTIVE</option>
        <option value="FILED">FILED</option>
        <option value="APPROVED">APPROVED</option>
      </select>
      <button type="submit" style={buttonStyle}>Create Client</button>
    </form>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px',
  margin: '8px 0',
  boxSizing: 'border-box'
};

const buttonStyle = {
  backgroundColor: '#007bff',
  color: 'white',
  padding: '10px 20px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  marginTop: '10px'
};

export default CreateClient;
