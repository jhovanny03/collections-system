import React from "react";
import { Document, Page, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 30 },
  heading: { fontSize: 18, marginBottom: 10 },
  text: { fontSize: 12, lineHeight: 1.5 },
});

const WarningLetterTemplate = ({
  clientName,
  today,
  amountDue,
  monthsPastDue,
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Warning Letter</Text>
      <Text style={styles.text}>
        Dear {clientName},{"\n\n"}
        This is a formal notice that your account is currently past due.
        {"\n"}
        You currently owe ${amountDue}. Your missed payment period is:{" "}
        {monthsPastDue}.{"\n\n"}
        Please take immediate action to bring your account current.
        {"\n\n"}
        Date of notice: {today}
      </Text>
    </Page>
  </Document>
);

export default WarningLetterTemplate;
