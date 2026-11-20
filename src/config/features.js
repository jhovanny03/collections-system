// src/config/features.js
//
// Features that MyCase now replaces. In the MyCase rebuild database, payments, clients
// and invoice amounts come from MyCase, so typing them in here would double count or go
// stale; those controls are hidden there. The original database keeps every feature.
//
// To bring one back, set its flag to true.
import { IS_REBUILD_DATABASE } from "../firebase";

export const MYCASE_IS_SOURCE = IS_REBUILD_DATABASE;

export const FEATURES = {
  // Record Payment form and the delete button on payments.
  manualPayments: !MYCASE_IS_SOURCE,
  // "Create Client" page; MyCase cases arrive through Case Setup instead.
  createClient: !MYCASE_IS_SOURCE,
  // Typing the invoice total / initial payment ("Setup Invoice and Initial Payment").
  editInvoiceSetup: !MYCASE_IS_SOURCE,
  // Editing name, MyCase link, case title and case type (Case Stage stays editable).
  editMyCaseFields: !MYCASE_IS_SOURCE,
  // "Add New Case" (archive this case and start another on the same record): each
  // MyCase case now has its own record.
  addNewCase: !MYCASE_IS_SOURCE,
};
