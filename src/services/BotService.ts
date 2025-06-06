import { Markup, Telegraf } from 'telegraf';
import { ENV, generateResponse } from '../index';
import { User } from '../models/User';

export class BotService {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(ENV.BOT_TOKEN);
    this.setupMiddleware();
    this.setupCommands();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      if (ctx.from) {
        await User.findOneAndUpdate(
          { telegramId: ctx.from.id },
          {
            telegramId: ctx.from.id,
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
          },
          { upsert: true, new: true },
        );
      }
      return next();
    });
  }

  private setupCommands(): void {
    this.bot.command('start', (ctx) => {
      ctx.reply(
        'Здравствуйте! Напишите номер тендера, который хотите проанализировать в формате: /tender 32514850391',
      );
    });

    this.bot.command('help', (ctx) => {
      ctx.reply(
        'Здравствуйте! Напишите номер тендера, который хотите проанализировать в формате: /tender 32514850391',
      );
    });

    this.bot.command('tender', async (ctx) => {
      const text = ctx.message.text.split('/tender')[1];
      console.log('Text to generate response:', text);
      ctx.reply('Пожалуйста, подождите...');
      const response = await generateResponse(text, ctx);
    });
  }

  private setupErrorHandling(): void {
    this.bot.catch((err, ctx) => {
      console.error(`Error for ${ctx.updateType}:`, err);
      ctx.reply('An error occurred while processing your request.');
    });
  }

  public async start(): Promise<void> {
    try {
      await this.bot.launch();
      console.log('Bot started successfully');
    } catch (err) {
      console.error('Failed to start bot:', err);
      process.exit(1);
    }
  }

  public async sendMessage(chatId: number, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, message);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  public async sendMessageToAdmin(
    chatId: number,
    message: string,
    tenderId: string,
  ): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(
        chatId,
        message,
        Markup.inlineKeyboard([Markup.button.callback('Проанализировать', `tender ${tenderId}`)]),
      );
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  public async stop(signal: string): Promise<void> {
    await this.bot.stop(signal);
  }
}
