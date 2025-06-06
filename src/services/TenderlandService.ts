import AdmZip from 'adm-zip';
import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import mammoth from 'mammoth';
import path from 'path';
import { ENV } from '..';
import { Config } from '../config/config';
import { Tender } from '../models/Tender';
import {
  CreateTaskResponse,
  CreateTaskResponseSchema,
  TendersResponse,
  TendersResponseSchema,
  TenderType,
} from '../schemas/tenderland.schema';
import { handleApiError } from '../utils/error-handler';
import puppeteer from 'puppeteer';
import textract from 'textract';
import xlsx from 'xlsx';
import { BotService } from './BotService';
import { User } from '../models/User';
import { GeminiService } from './GeminiService';
import { PROMPT } from '../constants/prompt';

export class TenderlandService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly proxy: {
    host: string;
    port: number;
    auth: {
      username: string;
      password: string;
    };
  };
  private readonly config: Config;
  private readonly bot: BotService;
  private readonly geminiService: GeminiService;

  constructor(config: Config) {
    this.config = config;
    this.geminiService = new GeminiService();
    this.bot = new BotService();
    this.baseUrl = 'https://tenderland.ru/api/v1';
    this.apiKey = ENV.TENDERLAND_API_KEY;
    this.proxy = {
      host: 'proxy.toolip.io',
      port: 31113,
      auth: {
        username:
          '8c5906b99fbd1c0bcd0f916d545c565ab1708e0be0f1496baf997f51b30a755f33f856d7d162eb0468f21a595aed6361a78de16df55e62667af44347edfe74b2b091ead69511bdde611e51d3ec97887f',
        password: 'imsp9d74sdxw',
      },
    };

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      // proxy: this.proxy,
      // httpsAgent: new https.Agent({
      //   rejectUnauthorized: false,
      // }),
    });

    this.axiosInstance.interceptors.request.use((config) => {
      const separator = config.url?.includes('?') ? '&' : '?';
      config.url = `${config.url}${separator}apiKey=${this.apiKey}`;
      return config;
    });
  }

  async getTenders(): Promise<TendersResponse | undefined> {
    console.log(
      `Running TenderlandService cron job at ${new Date().toISOString()} in ${this.config.environment} environment`,
    );
    const task = await this.createTaskForGettingTenders();

    if (!task) {
      console.error('Error getting task');
      return;
    }

    const tenders = await this.getTendersByTaskId(task.Id);

    if (!tenders) {
      console.error('Error getting tenders');
      return;
    }

    tenders.items.forEach(async (tender) => {
      const tenderData = tender.tender;
      try {
        await Tender.findOneAndUpdate(
          { regNumber: tenderData.regNumber },
          {
            $setOnInsert: {
              regNumber: tenderData.regNumber,
              tender: {
                ordinalNumber: tender.ordinalNumber,
                name: tenderData.name,
                beginPrice: tenderData.beginPrice,
                publishDate: tenderData.publishDate,
                endDate: tenderData.endDate,
                region: tenderData.region,
                typeName: tenderData.typeName,
                lotCategories: tenderData.lotCategories,
                files: tenderData.files,
                module: tenderData.module,
                etpLink: tenderData.etpLink,
                customers: tenderData.customers,
              },
              isProcessed: false,
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            includeResultMetadata: true,
          },
        );
      } catch (error) {
        console.error('Error processing tender:', tender.ordinalNumber, error);
      }
    });

    const tendersToProcess = await Tender.find({
      isProcessed: false,
    });

    if (tendersToProcess.length === 0) {
      console.error('Tender not found');
      return;
    }
  }

  async getNewTenders() {
    console.log('[getNewTenders] Getting new tenders');

    // const lastTender = await Tender.findOne({})
    //   .sort({ 'tender.ordinalNumber': -1 })
    //   .limit(1)
    //   .select('tender.ordinalNumber');

    // if (lastTender) {
    //   const { ordinalNumber } = lastTender.tender;
    //   const task = await this.createTaskForGettingTenders();

    //   if (!task) {
    //     console.error('[getNewTenders] Error getting task');
    //     return;
    //   }
    // } else {
    //   console.log('No tender found');
    // }

    const task = await this.createTaskForGettingTenders();

    if (!task) {
      console.error('[getNewTenders] Error getting task');
      return;
    }

    const tenders = await this.getTendersByTaskId(task.Id);

    if (!tenders) {
      console.error('[getNewTenders] There are no new tenders');
      return;
    }

    // Create an array of promises for checking each tender
    const tenderChecks = tenders.items.map(async (tender) => {
      const tenderData = tender.tender;
      const oldTender = await Tender.exists({ regNumber: tenderData.regNumber });
      if (oldTender) {
        return null;
      } else {
        console.log('New tender found', tenderData.regNumber);

        await Tender.create({
          regNumber: tenderData.regNumber,
          tender: {
            ordinalNumber: tender.ordinalNumber,
            name: tenderData.name,
            beginPrice: tenderData.beginPrice,
            publishDate: tenderData.publishDate,
            endDate: tenderData.endDate,
            region: tenderData.region,
            typeName: tenderData.typeName,
            lotCategories: tenderData.lotCategories,
            files: tenderData.files,
            module: tenderData.module,
            etpLink: tenderData.etpLink,
            customers: tenderData.customers,
          },
          isProcessed: false,
        });

        return tender;
      }
    });

    const newTenders = (await Promise.all(tenderChecks)).filter(
      (tender): tender is NonNullable<typeof tender> => tender !== null,
    );

    console.log('newTenders', newTenders.length, 'total tenders:', tenders.items.length);

    for (const tender of newTenders) {
      const unpackedFiles = await this.downloadZipFileAndUnpack(
        tender.tender.regNumber,
        tender.tender.files,
        'извещен',
      );

      if (!unpackedFiles) {
        console.error('[getNewTenders] Не удалось скачать или распаковать файлы');
        return;
      }

      console.log('unpackedFiles', unpackedFiles.files);

      const response = await this.geminiService.generateResponse(
        unpackedFiles.files[0],
        PROMPT.noticeOfPurchase,
      );

      const maxLength = 4096; // Telegram message length limit
      const chunks: string[] = [];
      let currentChunk = '';

      const words = response?.split(' ') || [];
      for (const word of words) {
        if ((currentChunk + word).length >= maxLength) {
          chunks.push(currentChunk);
          currentChunk = word + ' ';
        } else {
          currentChunk += word + ' ';
        }
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      await this.cleanupExtractedFiles(unpackedFiles.parentFolder);

      await User.find({})
        .cursor()
        .eachAsync(async (user) => {
          await this.bot.sendMessage(user.telegramId, `Новый тендер найден: ${tender.tender.name}`);
          chunks.forEach(async (chunk, index) => {
            if (index === chunks.length - 1) {
              await this.bot.sendMessageToAdmin(user.telegramId, chunk, tender.tender.regNumber);
            } else {
              await this.bot.sendMessage(user.telegramId, chunk);
            }
          });
        });
    }
  }

  async getTender(regNumber: string): Promise<null | {
    isProcessed: boolean;
    finalReport: string | null;
    regNumber: string;
    files: string;
  }> {
    const oldTender = await Tender.findOne({ regNumber }).select(
      'regNumber tender.files isProcessed finalReport',
    );
    if (!oldTender) {
      console.log('Старый тендер не найден в БД', regNumber);

      console.log('Ищем новый тендер в Тендерленде', regNumber);
      const newTender = await this.getTenderByRegNumber(regNumber);
      if (!newTender) {
        return null;
      }

      await Tender.create({
        regNumber: newTender.regNumber,
        tender: newTender,
      });

      return {
        isProcessed: false,
        finalReport: null,
        regNumber: newTender.regNumber,
        files: newTender.files,
      };
    } else {
      console.log('Старый тендер найден в БД', oldTender);
      return {
        isProcessed: oldTender.isProcessed,
        finalReport: oldTender.finalReport,
        regNumber: oldTender.regNumber,
        files: oldTender.tender.files,
      };
    }
  }

  async getTenderByRegNumber(
    regNumber: string,
    exportViewId: number = 1,
  ): Promise<TenderType | null> {
    try {
      console.log('Getting tender by reg number:', regNumber);
      const tender = await this.axiosInstance.get(
        `/Search/Get?keys=${regNumber}&exportViewId=${exportViewId}`,
      );
      const data = TendersResponseSchema.parse(tender.data);
      return data.items[0].tender;
    } catch (error) {
      console.log('[getTenderByRegNumber] Тендер не найден', error);
      return null;
    }
  }

  //   async processTender(filePaths: IFilePath[]): Promise<void> {
  //     for (const filePath of filePaths) {
  //       // console.log('Waiting 10 minutes');
  //       console.log('Processing', filePath.regNumber);
  //       const response = await claudeService.generateResponse(filePath.paths);
  //       console.log(response);
  //       const tender = await Tender.findOne({ regNumber: filePath.regNumber });
  //       if (!tender) {
  //         console.error('Tender not found', filePath.regNumber);
  //         return;
  //       }
  //       tender.claudeResponse = response;
  //       tender.isProcessed = true;

  //       await tender.save();

  //       await delay(60 * 1000);
  //     }

  //     // await this.cleanupExtractedFiles(filePaths.map((filePath) => filePath.paths));
  //   }

  async createTaskForGettingTenders(
    limit: number = this.config.tenderland.limit,
    autosearchId: number = this.config.tenderland.autosearchId,
  ): Promise<CreateTaskResponse | undefined> {
    try {
      console.log(
        `Creating task for getting tenders with autosearchId=${autosearchId} and limit=${limit}`,
      );
      const response = await this.axiosInstance.get(
        `/Export/Create?autosearchId=${autosearchId}&limit=${limit}&format=json`,
      );
      console.log('Task created successfully');
      return CreateTaskResponseSchema.parse(response.data);
    } catch (error) {
      console.log(error);
      handleApiError(error, 'createTaskForGettingTenders');
    }
  }

  async getTendersByTaskId(taskId: number): Promise<TendersResponse | undefined> {
    try {
      const response = await this.axiosInstance.get(`/Export/Get?exportId=${taskId}`);
      console.log('Getting tenders by task id with url:', response.request.res.responseUrl);
      const data = TendersResponseSchema.parse(response.data);
      return data;
    } catch (error) {
      handleApiError(error, 'getTendersByTaskId');
    }
  }

  async downloadZipFileAndUnpack(
    folderName: string,
    url: string,
    fileNameFilter?: string,
  ): Promise<{ files: string[]; parentFolder: string } | null> {
    try {
      // const agent = new https.Agent({
      //   rejectUnauthorized: false,
      // });
      console.log(`Downloading zip file from URL: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        // proxy: this.proxy,
        // httpsAgent: agent,
      });
      const zipFilePath = path.join(process.cwd(), 'tenderland.zip');

      console.log(`Writing zip file to: ${zipFilePath}`);
      // Write zip file
      await fs.promises.writeFile(zipFilePath, response.data);

      console.log('Unpacking zip file');
      // Unpack zip file
      const zip = new AdmZip(zipFilePath);
      const extractPath = path.join(process.cwd(), 'tenderland');
      const tenderPath = path.join(extractPath, folderName);

      // Create extract directory if it doesn't exist
      if (!fs.existsSync(extractPath)) {
        console.log(`Creating extract directory: ${extractPath}`);
        fs.mkdirSync(extractPath);
      }

      // Create tender-specific directory if it doesn't exist
      if (!fs.existsSync(tenderPath)) {
        console.log(`Creating tender directory: ${tenderPath}`);
        fs.mkdirSync(tenderPath);
      }

      // Create original and converted directories
      const originalPath = path.join(tenderPath, 'original');
      const convertedPath = path.join(tenderPath, 'converted');

      if (!fs.existsSync(originalPath)) {
        console.log(`Creating original directory: ${originalPath}`);
        fs.mkdirSync(originalPath);
      }
      if (!fs.existsSync(convertedPath)) {
        console.log(`Creating converted directory: ${convertedPath}`);
        fs.mkdirSync(convertedPath);
      }

      let extractedFiles: string[] = [];

      // Extract files synchronously
      console.log('Extracting files to:', originalPath);
      for (const entry of zip.getEntries()) {
        if (!entry.isDirectory) {
          const originalFileName = path.basename(entry.entryName);
          // Skip files that don't match the filter if one is provided
          if (
            fileNameFilter &&
            !originalFileName.toLowerCase().includes(fileNameFilter.toLowerCase())
          ) {
            console.log(
              `Skipping file ${originalFileName} as it doesn't match the filter: ${fileNameFilter}`,
            );
            continue;
          }
          const originalFilePath = path.join(originalPath, originalFileName);

          // Extract file synchronously
          const content = entry.getData();
          fs.writeFileSync(originalFilePath, content);
          extractedFiles.push(originalFilePath);
        }
      }

      // Clean up zip file
      console.log('Cleaning up zip file');
      fs.unlinkSync(zipFilePath);

      // Process any nested zip files
      const nestedZipFiles = extractedFiles.filter((file) => file.toLowerCase().endsWith('.zip'));
      for (const nestedZip of nestedZipFiles) {
        try {
          console.log(`Found nested zip file: ${nestedZip}`);
          const nestedZipContent = new AdmZip(nestedZip);

          // Extract nested files synchronously
          for (const entry of nestedZipContent.getEntries()) {
            if (!entry.isDirectory) {
              const originalFileName = path.basename(entry.entryName);
              // Skip files that don't match the filter if one is provided
              if (
                fileNameFilter &&
                !originalFileName.toLowerCase().includes(fileNameFilter.toLowerCase())
              ) {
                console.log(
                  `Skipping nested file ${originalFileName} as it doesn't match the filter: ${fileNameFilter}`,
                );
                continue;
              }
              const originalFilePath = path.join(originalPath, originalFileName);

              const content = entry.getData();
              fs.writeFileSync(originalFilePath, content);
              extractedFiles.push(originalFilePath);
            }
          }

          // Remove the nested zip file
          fs.unlinkSync(nestedZip);
          // Remove it from extractedFiles array
          extractedFiles = extractedFiles.filter((file) => file !== nestedZip);
        } catch (error) {
          console.error(`Error processing nested zip ${nestedZip}:`, error);
        }
      }

      // Verify all files exist before starting conversion
      extractedFiles = extractedFiles.filter((file) => {
        const exists = fs.existsSync(file);
        if (!exists) {
          console.log(`Warning: File ${file} does not exist, skipping`);
        }
        return exists;
      });

      console.log('All files extracted successfully. Starting conversion process...');
      console.log('Files to process:', extractedFiles);

      // Convert all supported files
      const convertedFiles: string[] = [];
      for (const file of extractedFiles) {
        const ext = path.extname(file).toLowerCase();
        const fileName = path.basename(file);

        // Skip files that don't match the filter if one is provided
        if (fileNameFilter && !fileName.toLowerCase().includes(fileNameFilter.toLowerCase())) {
          console.log(
            `Skipping file ${fileName} as it doesn't match the filter: ${fileNameFilter}`,
          );
          continue;
        }

        // Only process supported file types
        if (['.doc', '.docx', '.xls', '.xlsx'].includes(ext)) {
          try {
            console.log(`Processing file: ${file}`);

            // Convert the file
            const convertedFile = await this.convertWordToPdf(file);

            // Move the converted file to the converted directory
            if (!convertedFile) {
              console.error(`Failed to convert file ${file}`);
              continue;
            }

            const convertedFileName = path.basename(convertedFile);
            if (!convertedFileName) {
              console.error(`Failed to get converted file name for ${convertedFile}`);
              continue;
            }

            const finalPath = path.join(convertedPath, convertedFileName);

            // If the converted file is in a different location, move it
            if (convertedFile !== finalPath) {
              await fs.promises.rename(convertedFile, finalPath);
            }

            convertedFiles.push(finalPath);
            console.log(`Successfully converted and moved: ${finalPath}`);
          } catch (error) {
            console.error(`Failed to convert file ${file}:`, error);
            // Continue with other files even if one fails
          }
        } else if (['.html', '.htm', '.pdf'].includes(ext)) {
          try {
            console.log(`Copying file without conversion: ${file}`);
            const fileName = path.basename(file);
            const finalPath = path.join(convertedPath, fileName);

            // Copy the file to converted directory
            await fs.promises.copyFile(file, finalPath);
            convertedFiles.push(finalPath);
            console.log(`Successfully copied file to: ${finalPath}`);
          } catch (error) {
            console.error(`Failed to copy file ${file}:`, error);
          }
        } else if (ext === '.zip') {
          try {
            console.log(`Unpacking zip file to converted directory: ${file}`);
            const zipContent = new AdmZip(file);
            const extractedFromZip: string[] = [];

            // Extract all files from zip directly to converted directory
            for (const entry of zipContent.getEntries()) {
              if (!entry.isDirectory) {
                const fileName = path.basename(entry.entryName);
                // Skip files that don't match the filter if one is provided
                if (
                  fileNameFilter &&
                  !fileName.toLowerCase().includes(fileNameFilter.toLowerCase())
                ) {
                  console.log(
                    `Skipping nested file ${fileName} as it doesn't match the filter: ${fileNameFilter}`,
                  );
                  continue;
                }
                const tempPath = path.join(originalPath, `temp_${fileName}`);

                // Extract file synchronously to temp location first
                const content = entry.getData();
                fs.writeFileSync(tempPath, content);
                extractedFromZip.push(tempPath);
                console.log(`Extracted from zip to temp location: ${tempPath}`);
              }
            }

            // Process each extracted file
            for (const extractedFile of extractedFromZip) {
              const extractedExt = path.extname(extractedFile).toLowerCase();
              const extractedFileName = path.basename(extractedFile);
              const finalFileName = extractedFileName.startsWith('temp_')
                ? extractedFileName.substring(5)
                : extractedFileName;

              if (['.doc', '.docx', '.xls', '.xlsx'].includes(extractedExt)) {
                try {
                  console.log(`Processing extracted file: ${extractedFile}`);
                  const convertedFile = await this.convertWordToPdf(extractedFile);
                  if (!convertedFile) {
                    console.error(`Failed to convert extracted file ${extractedFile}`);
                    continue;
                  }
                  const finalPath = path.join(convertedPath, path.basename(convertedFile));

                  if (convertedFile !== finalPath) {
                    await fs.promises.rename(convertedFile, finalPath);
                  }

                  convertedFiles.push(finalPath);
                  console.log(`Successfully converted and moved extracted file to: ${finalPath}`);
                } catch (error) {
                  console.error(`Failed to convert extracted file ${extractedFile}:`, error);
                }
              } else if (['.html', '.htm', '.pdf'].includes(extractedExt)) {
                try {
                  const finalPath = path.join(convertedPath, finalFileName);
                  await fs.promises.copyFile(extractedFile, finalPath);
                  convertedFiles.push(finalPath);
                  console.log(`Copied extracted file to: ${finalPath}`);
                } catch (error) {
                  console.error(`Failed to copy extracted file ${extractedFile}:`, error);
                }
              } else {
                console.log(`Skipping unsupported file type from zip: ${extractedFile}`);
              }

              // Clean up temp file
              try {
                fs.unlinkSync(extractedFile);
              } catch (error) {
                console.error(`Failed to clean up temp file ${extractedFile}:`, error);
              }
            }
          } catch (error) {
            console.error(`Failed to process zip file ${file}:`, error);
          }
        } else {
          console.log(`Skipping unsupported file type: ${file}`);
        }
      }

      // Return both converted files and parent folder path
      return {
        files: convertedFiles,
        parentFolder: tenderPath,
      };
    } catch (error) {
      console.error('Error in downloadZipFileAndUnpack:', error);
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

  async cleanupExtractedFiles(parentFolder: string): Promise<void> {
    // Remove the directory and all contents recursively
    console.log('Removing directory:', parentFolder);
    if (fs.existsSync(parentFolder)) {
      fs.rmSync(parentFolder, { recursive: true, force: true });
    }
  }

  async convertWordToPdf(filePath: string): Promise<string | null> {
    try {
      const fileExt = path.extname(filePath).toLowerCase();
      if (fileExt === '.docx') {
        return await this.convertDocxToPdf(filePath);
      } else if (fileExt === '.doc') {
        return await this.convertDocToText(filePath);
      } else if (fileExt === '.xlsx' || fileExt === '.xls') {
        return await this.convertExcelToCsv(filePath);
      } else {
        console.log(
          'File is not supported. Only .doc, .docx, .xls, and .xlsx files are supported.',
        );
        return null;
      }
    } catch (error) {
      console.error('Error in convertWordToPdf:', error);
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

  private async convertDocToText(filePath: string): Promise<string | null> {
    try {
      const txtPath = filePath.replace(/\.doc$/i, '.txt');
      console.log(`Converting ${filePath} to text: ${txtPath}`);

      // Convert DOC to text
      const text = await new Promise<string>((resolve, reject) => {
        textract.fromFileWithPath(
          filePath,
          {
            preserveLineBreaks: true,
            preserveOnlyMultipleLineBreaks: true,
          },
          (error: Error | null, text?: string) => {
            if (error || !text) {
              reject(error || new Error('No text extracted'));
            } else {
              resolve(text);
            }
          },
        );
      });

      // Save text to file
      await fs.promises.writeFile(txtPath, text, 'utf8');
      console.log('Conversion to text completed successfully');

      return txtPath;
    } catch (error) {
      console.error('Error in convertDocToText:', error);
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

  private async convertDocxToPdf(filePath: string): Promise<string | null> {
    try {
      const pdfPath = filePath.replace(/\.docx$/i, '.pdf');
      console.log(`Converting ${filePath} to PDF: ${pdfPath}`);

      // Read the DOCX file
      const buffer = await fs.promises.readFile(filePath);

      // Convert to HTML
      const result = await mammoth.convertToHtml({ buffer });
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { 
                    font-family: Arial, sans-serif;
                    margin: 20mm;
                    line-height: 1.5;
                }
                img { 
                    max-width: 100%;
                    height: auto;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                }
                td, th {
                    border: 1px solid #ddd;
                    padding: 8px;
                }
                tr:nth-child(even) {
                    background-color: #f2f2f2;
                }
            </style>
        </head>
        <body>
            ${result.value}
        </body>
        </html>
      `;

      // Launch Puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
        ],
        executablePath: process.env.CHROME_BIN || undefined,
      });

      try {
        const page = await browser.newPage();

        // Set content and wait for network idle
        await page.setContent(html, {
          waitUntil: 'networkidle0',
        });

        // Generate PDF
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          margin: {
            top: '20mm',
            right: '20mm',
            bottom: '20mm',
            left: '20mm',
          },
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate:
            '<div style="font-size: 10px; text-align: center; width: 100%;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        });

        console.log('Conversion completed successfully');
        return pdfPath;
      } finally {
        await browser.close();
      }
    } catch (error) {
      console.error('Error in convertDocxToPdf:', error);
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

  private async convertExcelToCsv(filePath: string): Promise<string | null> {
    try {
      console.log(`Converting Excel file to CSV: ${filePath}`);

      // Read the Excel file
      const workbook = xlsx.readFile(filePath, { cellDates: true });

      // Create a directory for CSV files if multiple sheets
      const baseDir = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));
      const csvPaths: string[] = [];

      // Convert each sheet to CSV
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet, {
          FS: ',', // Field separator
          RS: '\n', // Row separator
        });

        // Generate CSV file path
        const csvFileName =
          workbook.SheetNames.length > 1 ? `${baseName}_${sheetName}.csv` : `${baseName}.csv`;
        const csvPath = path.join(baseDir, csvFileName);

        // Write CSV content
        await fs.promises.writeFile(csvPath, csv, 'utf8');
        csvPaths.push(csvPath);
        console.log(`Created CSV file: ${csvPath}`);
      }

      // If there's only one CSV file, return its path
      // If there are multiple, return the path to the first one
      // (caller can check the same directory for other sheets if needed)
      return csvPaths[0];
    } catch (error) {
      console.error('Error in convertExcelToCsv:', error);
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
}
