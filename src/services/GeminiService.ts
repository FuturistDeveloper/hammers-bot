import { createPartFromUri, GoogleGenAI } from '@google/genai';
import path from 'path';
import { PROMPT } from '../constants/prompt';
import { ENV } from '../index';
import parseResponse from '../utils/parsing';

export interface TenderResponse {
  tender: {
    name: string;
    number: string;
    type: string;
    price: string;
    currency: string;
    application_deadline: string;
    auction_date: string;
  };
  customer: {
    name: string;
    inn: string;
    ogrn: string;
    address: string;
    contacts: string;
  };
  delivery_terms: {
    delivery_period: {
      type: string;
      value: string;
    };
    delivery_location: string;
    payment_terms: {
      prepayment_percent: number;
      payment_days: number;
    };
    application_security: {
      amount: number | null;
      percent: number | null;
    };
    contract_security: {
      amount: number | null;
      percent: number | null;
    };
  };
  items: Array<{
    name: string;
    quantity: {
      value: string;
      unit: string;
    };
    specifications: Record<string, string>;
    requirements: string[];
    estimated_price: number | null;
  }>;
  special_conditions: {
    requirements_for_participants: string[];
    penalties: string[];
    other_conditions: string[];
  };
}

export class GeminiService {
  private readonly ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: ENV.GEMINI_API_KEY,
    });
  }

  public async generateResponse(
    filePath: string,
    prompt: string = PROMPT.gemini,
  ): Promise<string | null> {
    try {
      const fileName = path.basename(filePath) || '';

      const file = await this.ai.files.upload({
        file: filePath,
        config: {
          displayName: fileName,
        },
      });

      // Wait for the file to be processed.
      let getFile = await this.ai.files.get({ name: file.name as string });
      while (getFile.state === 'PROCESSING') {
        getFile = await this.ai.files.get({ name: file.name as string });
        console.log(`current file status: ${getFile.state}`);
        console.log('File is still processing, retrying in 5 seconds');

        await new Promise((resolve) => {
          setTimeout(resolve, 5000);
        });
      }
      if (file.state === 'FAILED') {
        console.error('[GeminiService] File processing failed.');
        return null;
      }

      // Add the file to the contents.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any = [prompt];

      if (file.uri && file.mimeType) {
        const fileContent = createPartFromUri(file.uri, file.mimeType);
        content.push(fileContent);
      }

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro-preview-05-06',
        contents: content,
      });

      return response.text || 'NOTHING RESPONSE';
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
      }
      return null;
    }
  }

  public async generateResponseFromText(text: string): Promise<TenderResponse | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro-preview-05-06',
        contents: [PROMPT.geminiAnalysis + '\n\n' + text],
      });
      if (!response.text) return null;
      const parsedResponse = parseResponse(response.text || '');
      return parsedResponse;
    } catch (error) {
      console.error('Error generating response from text:', error);
      return null;
    }
  }

  public async generateFindRequest(text: string): Promise<string | null> {
    try {
      console.log('Generating find request');
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro-preview-05-06',
        contents: [PROMPT.geminiFindRequest + '\n' + text],
      });
      return response.text || null;
    } catch (error) {
      console.error('Error generating response to Yandex:', error);
      return 'NOTHING RESPONSE';
    }
  }

  public async generateFinalRequest(text: string): Promise<string | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro-preview-05-06',
        contents: [PROMPT.geminiFinalRequest + '\n\n' + text],
      });

      console.log('Final request:', response?.text);
      return response?.text || null;
    } catch (error) {
      console.error('Error generating final request:', error);
      return null;
    }
  }
}
