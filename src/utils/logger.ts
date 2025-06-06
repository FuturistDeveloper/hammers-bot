import chalk from 'chalk';
import { Config } from '../config/config';

const logBox = (title: string, content: string) => {
  const width = 80;
  const titlePadding = Math.floor((width - title.length - 2) / 2);

  console.log('\n' + '═'.repeat(width));
  console.log(
    '║' +
      ' '.repeat(titlePadding) +
      chalk.bold(title) +
      ' '.repeat(width - titlePadding - title.length - 2) +
      '║',
  );
  console.log('═'.repeat(width));
  console.log(
    content
      .split('\n')
      .map((line) => '║ ' + line.padEnd(width - 4) + ' ║')
      .join('\n'),
  );
  console.log('═'.repeat(width) + '\n');
};

export const logConfig = (config: Config) => {
  const environmentColor = {
    development: chalk.yellow,
    production: chalk.green,
    local: chalk.blue,
  }[config.environment];

  const configContent = `
Environment: ${environmentColor(config.environment)}
`;

  logBox('Configuration', configContent);
};
