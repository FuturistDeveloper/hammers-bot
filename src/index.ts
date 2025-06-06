import dotenv from 'dotenv';
import express from 'express';
import { getConfig } from './config/config';
import { connectDB } from './config/database';
import { BotService } from './services/BotService';
import { TenderlandService } from './services/TenderlandService';
import { validateEnv } from './utils/env';
import { Context } from 'telegraf';
import { TenderAnalyticsService } from './services/TenderService';
import axios from 'axios';
import { GeminiService } from './services/GeminiService';
import cron from 'node-cron';
import { logConfig } from './utils/logger';

dotenv.config();

export const ENV = validateEnv();
export const config = getConfig();

const app = express();
app.use(express.json());

const tenderlandService = new TenderlandService(config);
const tenderService = new TenderAnalyticsService();
const botService = new BotService();

connectDB();

botService.start();

logConfig(config);
console.log('Current time: ', new Date().toLocaleString());

export const getAnalyticsForTenders = async (regNumber: string, ctx: Context): Promise<string> => {
  try {
    // 0 STEP: Найти тендер в базе данных
    const tender = await tenderlandService.getTender(regNumber);

    if (!tender) {
      console.error('[getAnalyticsForTenders] Тендер с таким номером не найден');
      return 'Тендер с таким номером не найден';
    }

    if (tender.isProcessed && tender.finalReport) {
      console.log('[getAnalyticsForTenders] Тендер уже был обработан');
      // const thirdLength = Math.ceil(tender.finalReport.length / 3);
      const maxLength = 4096; // Telegram message length limit
      const chunks = [];
      let currentChunk = '';

      const words = tender.finalReport.split(' ');
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

      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
      return 'Тендер уже был обработан';
    }

    ctx.reply('Тендер успешно найден! Начинаем анализ...');

    // 1 STEP: Скачать и распаковать файлы
    const unpackedFiles = await tenderlandService.downloadZipFileAndUnpack(
      tender.regNumber,
      tender.files,
    );

    if (!unpackedFiles) {
      console.error('[getAnalyticsForTenders] Не удалось скачать или распаковать файлы');
      return 'Не удалось скачать или распаковать файлы';
    }

    console.log('unpackedFiles', unpackedFiles);

    // 2 STEP: Анализ тендера с помощью Gemini Pro
    const claudeResponse = await tenderService.analyzeTender(tender.regNumber, unpackedFiles.files);

    // // 3 STEP: Удалить распакованные файлы
    await tenderlandService.cleanupExtractedFiles(unpackedFiles.parentFolder);

    if (!claudeResponse) {
      console.error('[getAnalyticsForTenders] Не удалось получить ответ Gemini');
      return 'Не удалось получить ответ от ИИ';
    }

    // 4 STEP: Анализ товаров
    const isAnalyzed = await tenderService.analyzeItems(tender.regNumber, claudeResponse);

    if (isAnalyzed) {
      // 5 STEP: Генерация отчета
      const finalReport = await tenderService.generateFinalReport(tender.regNumber);

      if (finalReport) {
        // const thirdLength = Math.ceil(tender.finalReport.length / 3);
        const maxLength = 4096; // Telegram message length limit
        const chunks = [];
        let currentChunk = '';

        const words = finalReport.split(' ');
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

        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
        return 'Анализ тендера завершен';
      } else {
        await ctx.reply('Не удалось получить ответ от ИИ');
        return 'Не удалось получить ответ от ИИ';
      }
    } else {
      return 'Не удалось проанализировать товары';
    }
  } catch (err) {
    console.error('Error in analytics job:', err);
    return `Произошла ошибка при анализе тендера: ${regNumber}`;
  }
};

cron.schedule(config.cronSchedule, async () => {
  console.log('Getting new tenders');
  await tenderlandService.getNewTenders();
});

app.listen(ENV.PORT, () => {
  console.log(`Server is running on port ${ENV.PORT} in ${config.environment} environment`);
});

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Bot is running',
    environment: config.environment,
  });
});

app.get('/api/test/gemini', async (req, res) => {
  try {
    const gemini = new GeminiService();
    const response = await gemini.generateResponseFromText('whats the weather in moscow');
    return res.send(response);
  } catch (error) {
    console.error('Error in test job:', error);
    return res.status(500).send('Произошла ошибка при тестировании');
  }
});

app.get('/api/test/zip', async (req, res) => {
  console.log('test zip');
  const response = await fetch(
    'https://tenderland.ru/Api/File/GetAll?entityId=TL2017285092&entityTypeId=1&apiKey=cebc71bc-ee83-4945-946c-97926f84790c',
    {
      method: 'GET',
    },
  );
  const data = await response.arrayBuffer();
  console.log(data);
  return res.send(data);
});

app.get('/api/test/dnsleak', async (req, res) => {
  const response = await axios.get('https://www.dnsleaktest.com/');
  return res.send(response.data);
});

process.once('SIGINT', () => botService.stop('SIGINT'));
process.once('SIGTERM', () => botService.stop('SIGTERM'));
