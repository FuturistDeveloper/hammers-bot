# Tenderland Bot

A Telegram bot built with Node.js, Express, Telegraf, TypeScript, and MongoDB.

## Features

- Express backend server
- Telegram bot with basic commands
- TypeScript support
- MongoDB database integration
- Environment variable validation with Zod
- ESLint and Prettier for code quality

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```
   PORT=3000
   BOT_TOKEN=your_telegram_bot_token_here
   MONGODB_URI=mongodb://localhost:27017/tenderland-bot
   ```

4. Make sure MongoDB is installed and running on your system
5. Build the project:

   ```bash
   npm run build
   ```

6. Start the server:

   ```bash
   npm start
   ```

## Development

- Run in development mode with hot reload:

  ```bash
  npm run dev
  ```

- Format code:

  ```bash
  npm run format
  ```

- Lint code:

  ```bash
  npm run lint
  ```

- Fix linting issues:

  ```bash
  npm run lint:fix
  ```
