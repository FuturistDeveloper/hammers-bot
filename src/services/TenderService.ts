import * as fs from 'fs';
import { Tender } from '../models/Tender';
import { GeminiService, TenderResponse } from './GeminiService';
import { GoogleSearchService } from './GoogleService';
import { formatTenderData, PROMPT } from '../constants/prompt';
import path from 'path';

interface AnalyzedFile {
  analyzedFile: string;
  response: string;
}

export class TenderAnalyticsService {
  private geminiService: GeminiService;
  googleSearch = new GoogleSearchService();

  constructor() {
    this.geminiService = new GeminiService();
  }

  // private async saveAnalysisToFile(
  //   tender: any,
  //   analyzedFiles: AnalyzedFile[],
  //   finalAnalysis: string,
  // ) {
  //   const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  //   const fileName = path.join(this.outputDir, `tender_${tender.regNumber}_${timestamp}.txt`);

  //   let content = `Tender Analysis Report\n`;
  //   content += `===================\n\n`;
  //   content += `Tender Registration Number: ${tender.regNumber}\n`;
  //   content += `Analysis Date: ${new Date().toISOString()}\n\n`;
  //   content += `Individual File Analysis\n`;
  //   content += `=====================\n\n`;

  //   for (const file of analyzedFiles) {
  //     content += `File: ${file.analyzedFile}\n`;
  //     content += `Analysis:\n${file.response}\n`;
  //     content += `-------------------\n\n`;
  //   }

  //   content += `Final Analysis\n`;
  //   content += `=============\n\n`;
  //   content += finalAnalysis;

  //   await fs.promises.writeFile(fileName, content, 'utf8');
  //   console.log(`Analysis saved to file: ${fileName}`);
  //   return fileName;
  // }

  public async analyzeTender(
    regNumber: string,
    pathFiles: string[],
  ): Promise<TenderResponse | null> {
    try {
      const analyzedFiles: AnalyzedFile[] = [];

      for (const pathFile of pathFiles) {
        console.log('Processing file:', pathFile);
        const response = await this.geminiService.generateResponse(pathFile);
        if (!response) {
          console.error('No response found for file:', pathFile);
          return null;
        }
        analyzedFiles.push({
          analyzedFile: pathFile,
          response,
        });
        console.log('Finished processing file:', pathFile);
      }

      const combinedText = analyzedFiles
        .map((file) => {
          return `File: ${file.analyzedFile}\n\nAnalysis:\n${file.response}\n\n---\n\n`;
        })
        .join('');

      await Tender.findOneAndUpdate(
        { regNumber },
        {
          $set: {
            analyzedFiles,
          },
        },
        { new: true },
      );

      console.log('Processing tender:', regNumber);

      const finalAnalysis = await this.geminiService.generateResponseFromText(combinedText);

      if (!finalAnalysis) {
        console.error('No final analysis found for tender:', regNumber);
        return null;
      }

      console.log('Tender Files Analysis Finished for:', regNumber);

      await Tender.findOneAndUpdate(
        { regNumber },
        {
          $set: {
            claudeResponse: finalAnalysis,
          },
        },
        { new: true },
      );

      return finalAnalysis;
    } catch (err) {
      console.error('Error in [analyzeTender]:', err);
      return null;
    }
  }

  public async analyzeItems(regNumber: string, tender: TenderResponse) {
    const itemPromises = tender.items.map(async (item, i: number) => {
      const { name, specifications } = item;
      const specificationsText = Object.entries(specifications);
      const specificationsTextString = specificationsText
        .map(([key, value]) => `\n${key}: ${value}`)
        .join(', ');
      const itemText = `
      Наименование товара: ${name}
      Технические характеристики товара: ${specificationsTextString}
      `;

      console.log('Analyzing item:', name);
      const itemResponse = await this.geminiService.generateFindRequest(itemText);

      if (!itemResponse) {
        console.error('No item response found for:', name);
        return;
      }

      console.log('Item Responded', name);

      const findRequest = itemResponse?.split('\n');
      console.log('Find request:', findRequest);

      await Tender.findOneAndUpdate(
        { regNumber },
        {
          $push: {
            findRequests: {
              itemName: name,
              findRequest,
            },
          },
        },
      );

      const searchPromises = findRequest.map(async (request) => {
        console.log('Searching for:', request);
        const results = await this.googleSearch.search(request);
        console.log(`Searching finished for: ${request}`);

        const websitePromises = results.map(async (result) => {
          const { link } = result;
          const randomUID = crypto.randomUUID();
          const outputPath = `${randomUID}.html`;

          console.log('Downloading HTML for:', link);
          const path = await this.googleSearch.downloadHtml(link, outputPath);

          if (!path) {
            console.error('HTML was not downloaded for:', link);
            return {
              link,
              title: result.title,
              snippet: result.snippet,
              content: null,
            };
          }

          console.log('HTML downloaded for:', link);

          const response = await this.geminiService.generateResponse(
            path,
            PROMPT.geminiAnalyzeHTML,
          );

          // try {
          //   fs.unlinkSync(path);
          //   console.log('Successfully deleted downloaded file:', path);
          // } catch (error) {
          //   console.error('Error deleting file:', error);
          // }

          if (!response) {
            console.error('Failed to generate response to analyze the content from HTML');
            return {
              link,
              title: result.title,
              snippet: result.snippet,
              content: null,
            };
          }
          console.log('Analyzing HTML finished for:', link);

          return {
            link,
            title: result.title,
            snippet: result.snippet,
            content: response,
          };
        });

        const responses = await Promise.all(websitePromises);
        await Tender.findOneAndUpdate(
          { regNumber },
          {
            $push: {
              [`findRequests.${i}.parsedRequest`]: {
                requestName: request,
                responseFromWebsites: responses,
              },
            },
          },
        );

        return responses;
      });

      await Promise.all(searchPromises);
    });

    const results = await Promise.all(itemPromises);

    const htmlDir = path.join(process.cwd(), 'html');
    fs.rmSync(htmlDir, { recursive: true, force: true });
    console.log('Successfully deleted HTML directory');

    return results;
  }

  public async generateFinalReport(regNumber: string): Promise<string | null> {
    try {
      const tender = await Tender.findOne({ regNumber });

      if (!tender) {
        console.error('[generateFinalReport] Тендер не найден');
        return null;
      }

      const text = formatTenderData(tender);

      console.log('Генерация финального отчета для тендера:', regNumber);
      const answer = await this.geminiService.generateFinalRequest(text);

      if (!answer) {
        console.error('[generateFinalReport] Не удалось получить ответ от ИИ');
        return null;
      }

      await Tender.findOneAndUpdate({ regNumber }, { isProcessed: true, finalReport: answer });

      return answer;
    } catch (err) {
      console.error('[generateFinalReport] Ошибка при генерации отчета:', err);
      return null;
    }
  }
}
