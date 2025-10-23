// src/ClientDashboard/letters/_helpers/generateFilledLetterBlob.js
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { DOMParser } from "@xmldom/xmldom";

export async function generateFilledLetterBlob(templateBuffer, values) {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag) => ({ get: (scope) => scope[tag] }),
    xmlParser: new DOMParser(),
  });
  doc.setData(values);
  doc.render();
  return doc.getZip().generate({ type: "blob" });
}