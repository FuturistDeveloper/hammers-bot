import dotenv from 'dotenv';
import express from 'express';
import { Context } from 'telegraf';
import { getConfig } from './config/config';
import { connectDB } from './config/database';
import { BotService } from './services/BotService';
import { GeminiService } from './services/GeminiService';
import { SearchService } from './services/SearchService';
import { validateEnv } from './utils/env';

dotenv.config();

export const ENV = validateEnv();
export const config = getConfig();

const app = express();
app.use(express.json());

const botService = new BotService();
const gemini = new GeminiService();
const searchService = new SearchService();

connectDB();

botService.start();

export const generateResponse = async (text: string, ctx: Context) => {
  try {
    const findRequest = await gemini.generateFindRequest(text);
    console.log('Find request:', findRequest);

    if (!findRequest) {
      throw new Error('Не удалось сгенерировать запрос для поиска');
    }

    const findRequestString = findRequest.join('\n');

    ctx.reply(findRequestString);

    ctx.reply('Ищу информацию в интернете...');

    for (const request of findRequest) {
      const searchResult = await searchService.search(request);
      console.log('Search result:', searchResult);

      if (!searchResult) {
        throw new Error('Не удалось найти результаты поиска');
      }

      ctx.reply(JSON.stringify(searchResult));
    }
  } catch (error) {
    console.error('Ошибка при генерации ответа:', error);

    if (error instanceof Error) {
      return error.message;
    }
    return 'Произошла ошибка при генерации ответа';
  }
};

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

process.once('SIGINT', () => botService.stop('SIGINT'));
process.once('SIGTERM', () => botService.stop('SIGTERM'));
