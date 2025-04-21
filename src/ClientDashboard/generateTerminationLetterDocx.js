import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export const generateTerminationLetterDocx = ({
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
  refundAmount,
  amountOwed,
}) => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun(
                "The Law Firm of Moumita Rahman, PLLC\n111 John Street, Suite 1260\nNew York, NY 10038\nTel: 212.248.7907 | Fax: 347.665.1480\nmoumita@rahmanlawpllc.com | www.RahmanLawPLLC.com"
              ),
            ],
          }),
          new Paragraph({ text: "\n" }),
          new Paragraph({ text: today }),
          new Paragraph({ text: "Via Electronic and Post Mail" }),
          new Paragraph({ text: clientName }),
          new Paragraph({ text: clientAddress }),
          new Paragraph({ text: clientCityStateZip }),
          new Paragraph({ text: clientPhone }),
          new Paragraph({ text: clientEmail }),

          new Paragraph({
            text: "\nNOTICE OF TERMINATION OF REPRESENTATION",
            heading: "HEADING_1",
          }),

          new Paragraph({
            children: [
              new TextRun(
                `Dear ${clientName},\n\nThis letter serves as the official termination of my legal representation of you in your ${caseType} matter, according to the terms of the contract for our services. I am withdrawing my representation of you and am no longer your lawyer.`
              ),
            ],
          }),

          new Paragraph({
            text: `Based on the Retainer Agreement you signed with my office on ${retainerDate}, you agreed to fulfill a monthly payment in order for me to prepare your case, and I agreed to begin work on your case despite not receiving payment in full.`,
          }),

          new Paragraph({
            text: `You have failed to make payments on ${missedDates.join(
              ", "
            )}, and, after numerous attempts at communicating with you on this matter, we have not been able to come to an agreement.`,
          }),

          new Paragraph({
            text: `A warning letter was issued to you on ${warningDate} for non-payment of services and an outstanding balance which has not successfully been addressed.`,
          }),

          new Paragraph({
            text: `There has been a breakdown in the Attorney-Client relationship. We will also be withdrawing our G-28 Notice of Representation with USCIS on your case.`,
          }),

          new Paragraph({
            text: "\nWork Calculation and Expenses Explanation",
          }),

          new Paragraph({
            text: `Per the Discharge of Representation Clause in the Retainer Agreement you signed, the unearned portion of the legal fee (if any) is calculated as follows:`,
          }),

          new Paragraph({ text: `Amount Paid: ${amountPaid}` }),
          new Paragraph({ text: `Hours Worked: ${hoursWorked}` }),
          new Paragraph({ text: `Value of Work Performed: ${valueOfWork}` }),
          new Paragraph({ text: `Expenses: ${expenses}` }),
          new Paragraph({
            text: `${amountPaid} – (${valueOfWork} + ${expenses}) = ${refundAmount}`,
          }),

          new Paragraph({
            text: `According to the retainer, you are entitled to the difference between the amount paid and unearned portion. Since work has been performed in excess of the amount paid so far, you owe the firm ${amountOwed}. However, we are exercising our discretion to not charge you for this excess.`,
          }),

          new Paragraph({
            text: `Please note that the termination of this agreement does not constitute any admission of liability by the Law Firm or its members.`,
          }),

          new Paragraph({
            text: "\nWe wish you the best of luck in your future endeavors.",
          }),
          new Paragraph({ text: "\nSincerely," }),
          new Paragraph({ text: "Moumita Rahman, Esq." }),
        ],
      },
    ],
  });

  Packer.toBlob(doc).then((blob) => {
    saveAs(blob, `${clientName.replace(/\s/g, "_")}_Termination_Letter.docx`);
  });
};
