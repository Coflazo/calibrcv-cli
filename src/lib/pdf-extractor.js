import pdfParse from 'pdf-parse';

/**
 * Extract plain text from a PDF buffer.
 * @param {Buffer} pdfBuffer - Raw PDF file bytes.
 * @returns {Promise<{ text: string, pages: number, info: object }>}
 */
export async function extractTextFromPDF(pdfBuffer) {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    throw new PDFExtractionError('Empty PDF buffer provided');
  }

  try {
    const data = await pdfParse(pdfBuffer, { max: 10 });
    const text = data.text?.trim() || '';

    if (text.length < 50) {
      return {
        text,
        pages: data.numpages || 1,
        info: {
          title: data.info?.Title || null,
          author: data.info?.Author || null,
          creator: data.info?.Creator || null,
        },
        isImageBased: true,
      };
    }

    return {
      text,
      pages: data.numpages || 1,
      info: {
        title: data.info?.Title || null,
        author: data.info?.Author || null,
        creator: data.info?.Creator || null,
      },
    };
  } catch (err) {
    if (err instanceof PDFExtractionError) throw err;

    if (err.message?.includes('encrypted') || err.message?.includes('password')) {
      throw new PDFExtractionError('This PDF is password-protected. Please use an unprotected version.');
    }

    throw new PDFExtractionError(`Failed to parse PDF: ${err.message}`);
  }
}

export class PDFExtractionError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'PDFExtractionError';
  }
}
