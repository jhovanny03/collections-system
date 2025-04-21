import React from "react";
import { Document, Page, Text, StyleSheet, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    lineHeight: 1.5,
    fontFamily: "Times-Roman",
  },
  section: { marginBottom: 10 },
  bold: { fontWeight: "bold" },
  header: { textAlign: "center", marginBottom: 20 },
});

const TerminationLetterTemplate = ({
  clientName,
  clientAddress,
  clientCityStateZip,
  clientPhone,
  clientEmail,
  caseType,
  today,
  retainerDate,
  missedDates,
  warningDate,
  amountPaid,
  hoursWorked,
  valueOfWork,
  expenses,
  amountOwed,
  refundAmount,
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <Text>The Law Firm of Moumita Rahman, PLLC</Text>
        <Text>111 John Street, Suite 1260, New York, NY 10038</Text>
        <Text>Tel: 212.248.7907 | Fax: 347.665.1480</Text>
        <Text>moumita@rahmanlawpllc.com | www.RahmanLawPLLC.com</Text>
      </View>

      <Text>{today}</Text>
      <Text>Via Electronic and Post Mail</Text>
      <Text>{clientName}</Text>
      <Text>{clientAddress}</Text>
      <Text>{clientCityStateZip}</Text>
      <Text>{clientPhone}</Text>
      <Text>{clientEmail}</Text>

      <Text style={{ marginVertical: 10, fontWeight: "bold" }}>
        NOTICE OF TERMINATION OF REPRESENTATION
      </Text>

      <Text>Dear {clientName},</Text>
      <Text style={styles.section}>
        This letter serves as the official termination of my legal
        representation of you in your {caseType} matter, according to the terms
        of the contract for our services. I am withdrawing my representation of
        you and am no longer your lawyer.
      </Text>

      <Text style={styles.section}>
        Based on the Retainer Agreement you signed with my office on{" "}
        {retainerDate}, you agreed to fulfill a monthly payment in order for me
        to prepare your case, and I agreed to begin work on your case despite
        not receiving payment in full.
      </Text>

      <Text style={styles.section}>
        You have failed to make payments on {missedDates.join(", ")}, and, after
        numerous attempts at communicating with you on this matter, we have not
        been able to come to an agreement.
      </Text>

      <Text style={styles.section}>
        A warning letter was issued to you on {warningDate} for non-payment of
        services and an outstanding balance which has not successfully been
        addressed.
      </Text>

      <Text style={styles.section}>
        There has been a breakdown in the Attorney-Client relationship. As such,
        I am withdrawing my representation of you and am no longer your lawyer.
        We will also be withdrawing our G-28 Notice of Representation with USCIS
        on your case.
      </Text>

      <Text style={styles.section}>
        Per the Discharge of Representation Clause in the Retainer Agreement you
        signed, the unearned portion of the legal fee (if any) is calculated as
        follows:
      </Text>

      <Text style={styles.section}>Amount Paid: {amountPaid}</Text>
      <Text style={styles.section}>Hours Worked: {hoursWorked}</Text>
      <Text style={styles.section}>Value of Work Performed: {valueOfWork}</Text>
      <Text style={styles.section}>Expenses: {expenses}</Text>

      <Text style={styles.section}>
        (Amount Paid Total) – (Dollar Value of Work Performed + Expenses) =
        Refund Amount
      </Text>
      <Text style={styles.section}>
        {amountPaid} – ({valueOfWork} + {expenses}) = {refundAmount}
      </Text>

      <Text style={styles.section}>
        According to the retainer, you are entitled to the difference between
        the amount paid to the Law Firm and any unearned portion. Since work has
        been performed in excess of the amount paid so far, you owe the firm
        {amountOwed}. However, we are exercising our discretion to not charge
        you for this excess.
      </Text>

      <Text style={styles.section}>
        Please note that the termination of this agreement does not mean you are
        not eligible for the benefits you are seeking and/or had originally
        hired us for and this withdrawal should not be construed as otherwise.
      </Text>

      <Text style={styles.section}>
        We wish you the best of luck in your future endeavors.
      </Text>

      <Text>Sincerely,</Text>
      <Text>Moumita Rahman, Esq.</Text>
    </Page>
  </Document>
);

export default TerminationLetterTemplate;
