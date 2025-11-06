
import { GoogleGenAI, Type } from "@google/genai";
import type { ExtractedInvoiceData, Voucher, StockItem } from '../types';

// FIX: Initialize GoogleGenAI with API key from environment variables as per guidelines.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove "data:mime/type;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

// FIX: Enhanced prompt with specific instructions for better accuracy on complex invoices.
const invoicePrompt = `You are an expert accounting assistant specialized in Optical Character Recognition (OCR) and data extraction from invoices, including handwritten ones. Analyze the provided invoice image and extract the following information.

Your response MUST be a single, valid JSON object that adheres to the provided schema.

Extraction Guidelines:
1.  **sellerName**: The name of the company issuing the invoice.
2.  **invoiceNumber**: The invoice number. It's often labeled "No:".
3.  **invoiceDate**: The date of the invoice. Format it as YYYY-MM-DD.
4.  **dueDate**: The payment due date. If not present, use an empty string. Format it as YYYY-MM-DD.
5.  **subtotal**: The total amount before any taxes are applied. Often labeled "Total Amount Before Tax".
6.  **cgstAmount**: The total CGST amount. If not present, use 0.
7.  **sgstAmount**: The total SGST amount. If not present, use 0.
8.  **totalAmount**: The final grand total after all taxes. Often labeled "Total Amount After Tax".
9.  **lineItems**: An array of items from the invoice table.
    *   **itemDescription**: The description of the item.
    *   **hsnCode**: The HSN code for the item. If not available, use an empty string.
    *   **quantity**: The numerical quantity. Ignore units like "Nos" or "Pcs" in the final number (e.g., "2Nos" should be 2).
    *   **rate**: The price per unit. Ignore symbols like "/-".

If any field is unreadable or not present, use a reasonable default: "" for strings, 0 for numbers, and an empty array [] for lineItems.
`;

// FIX: Expanded responseSchema to include more fields for better data integrity and cross-verification.
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    sellerName: { type: Type.STRING },
    invoiceNumber: { type: Type.STRING },
    invoiceDate: { type: Type.STRING, description: 'YYYY-MM-DD format' },
    dueDate: { type: Type.STRING, description: 'YYYY-MM-DD format, can be empty' },
    subtotal: { type: Type.NUMBER, description: 'Total before tax' },
    cgstAmount: { type: Type.NUMBER, description: 'CGST amount' },
    sgstAmount: { type: Type.NUMBER, description: 'SGST amount' },
    totalAmount: { type: Type.NUMBER, description: 'Grand total after tax' },
    lineItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          itemDescription: { type: Type.STRING },
          hsnCode: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          rate: { type: Type.NUMBER },
        },
        required: ['itemDescription', 'hsnCode', 'quantity', 'rate'],
      },
    },
  },
  required: ['sellerName', 'invoiceNumber', 'invoiceDate', 'subtotal', 'cgstAmount', 'sgstAmount', 'totalAmount', 'lineItems'],
};


const extractInvoiceDataWithRetry = async (
  file: File,
  maxRetries = 3,
  initialDelay = 1000
): Promise<ExtractedInvoiceData> => {
  const base64Image = await fileToBase64(file);
  let attempt = 0;
  let delay = initialDelay;

  const imagePart = {
    inlineData: {
      mimeType: file.type,
      data: base64Image,
    },
  };
  
  const textPart = { text: invoicePrompt };

  while (attempt < maxRetries) {
    try {
      // FIX: Replaced direct fetch with ai.models.generateContent from the SDK.
      const response = await ai.models.generateContent({
        // FIX: Using recommended model for this task.
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });
      
      // FIX: Use response.text property which is guaranteed to be a string.
      const textResponse = response.text;
      
      // FIX: Removed manual JSON cleaning as responseSchema ensures clean JSON output.
      const parsedData: ExtractedInvoiceData = JSON.parse(textResponse.trim());
      return parsedData;

    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error);
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error('Failed to extract invoice data after multiple retries.');
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
  throw new Error('Should not be reached');
};

const getAgentResponse = async (
    contextData: string,
    userQuery: string
): Promise<string> => {
    try {
        const systemInstruction = `You are an expert accounting assistant for an app called AI-Accounting. 
        The user will ask you questions about their accounting data. 
        Use the provided JSON data to answer their questions accurately and perform complex analysis. 
        The data contains ledgers, stock items, and vouchers. Be friendly and concise.
        Today's date is ${new Date().toLocaleDateString()}.
        If a question is vague, ask for clarification.
        If a question is outside the scope of accounting or the provided data, politely decline to answer.`;

        const fullPrompt = `Here is the current accounting data in JSON format:
        ${contextData}

        Based on the data above, please answer the following question:
        ${userQuery}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: fullPrompt,
            config: {
                systemInstruction: systemInstruction,
                thinkingConfig: { thinkingBudget: 32768 },
            }
        });

        return response.text;
    } catch (error) {
        console.error("Error getting agent response:", error);
        return "Sorry, I encountered an error while processing your request.";
    }
};

const getGroundedAgentResponse = async (
    userQuery: string
): Promise<{ text: string; sources: { uri: string; title: string; }[] }> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userQuery,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const text = response.text;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources = groundingChunks
            .map(chunk => chunk.web)
            .filter(web => web && web.uri && web.title)
            .map(web => ({ uri: web.uri as string, title: web.title as string }));

        return { text, sources };

    } catch (error) {
        console.error("Error getting grounded agent response:", error);
        return { text: "Sorry, I encountered an error while searching the web.", sources: [] };
    }
}

const generateVoucherNarration = async (voucherData: Partial<Voucher>): Promise<string> => {
    const prompt = `Based on the following voucher data, write a brief, professional accounting narration (under 15 words).
    
    Data: ${JSON.stringify(voucherData, null, 2)}
    
    Example:
    - For a payment to a supplier: "Being payment made to [Party Name] against invoice [Invoice No.]"
    - For a sale: "Being goods sold to [Party Name] on credit."
    - For a cash deposit: "Being cash deposited into [Bank Name]."
    
    Narration:`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating narration:", error);
        return "";
    }
};

const stockItemsPrompt = `You are an expert data entry assistant. Analyze the provided file (image or PDF) which contains a list of inventory or stock items. Extract the details for each item and return them as a JSON array.

The fields to extract for each item are:
- name: The name of the stock item.
- group: The category or group the item belongs to.
- unit: The unit of measurement (e.g., Nos, Pcs, Kgs).
- hsn: The HSN/SAC code. If not present, use an empty string.
- gstRate: The GST percentage. If not present, use 0.
- quantity: The opening stock or quantity. If not present, use 0.

Your response MUST be a single, valid JSON array of objects that adheres to the provided schema. If the document is unreadable or contains no stock items, return an empty array [].
`;

const stockItemsSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            group: { type: Type.STRING },
            unit: { type: Type.STRING },
            hsn: { type: Type.STRING },
            gstRate: { type: Type.NUMBER },
            quantity: { type: Type.NUMBER },
        },
        required: ['name', 'group', 'unit'],
    }
};

const extractStockItemsFromFile = async (file: File): Promise<StockItem[]> => {
    const base64Data = await fileToBase64(file);

    const filePart = {
        inlineData: {
            mimeType: file.type,
            data: base64Data,
        },
    };
    
    const textPart = { text: stockItemsPrompt };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [filePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: stockItemsSchema,
            },
        });
        
        const textResponse = response.text;
        const parsedData: StockItem[] = JSON.parse(textResponse.trim());
        return parsedData;
    } catch (error) {
        console.error('Error extracting stock items from file:', error);
        throw new Error('Failed to extract stock items from the provided file. Please ensure it is clear and contains a list of items.');
    }
};


export { extractInvoiceDataWithRetry, getAgentResponse, getGroundedAgentResponse, generateVoucherNarration, extractStockItemsFromFile };
