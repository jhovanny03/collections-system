import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import { DOMParser } from "@xmldom/xmldom";

export const generateFilledLetter = async (
  templateBuffer,
  values,
  filename = "Termination_Letter.docx"
) => {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      parser: (tag) => {
        return {
          get: (scope) => scope[tag],
        };
      },
      xmlParser: new DOMParser(),
    });

    doc.setData(values);
    doc.render();

    const out = doc.getZip().generate({ type: "blob" });
    saveAs(out, filename);
  } catch (error) {
    console.error("❌ Error generating letter:", error);
    alert(
      "There was an error generating the letter. Please check your template and input data."
    );
  }
};
