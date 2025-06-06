import axios from 'axios';
import dotenv from 'dotenv';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import * as path from 'path';
import z from 'zod';
import { ENV } from '..';

dotenv.config();

interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  content?: string;
}

export class SearchService {
  private readonly apiKey: string;
  private readonly searchEngineId: string;
  private readonly baseUrl = 'https://www.googleapis.com/customsearch/v1';

  constructor() {
    this.apiKey = ENV.GOOGLE_API_KEY;
    this.searchEngineId = ENV.GOOGLE_SEARCH_ENGINE_ID;
  }

  public async fetchWebpageContent(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 5000, // 5 second timeout
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      // Parse HTML and extract text content
      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      // Remove script and style elements
      const scripts = document.getElementsByTagName('script');
      const styles = document.getElementsByTagName('style');
      Array.from(scripts).forEach((script: Element) => script.remove());
      Array.from(styles).forEach((style: Element) => style.remove());

      // Get text content and clean it up
      let text = document.body.textContent || '';

      // Clean up the text
      text = text
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
        .trim(); // Remove leading/trailing whitespace

      console.log('Fetched and parsed content from ' + url);

      return text;
    } catch (error) {
      console.error('Could not fetch and parse content from ' + url);
      // console.error(`Error fetching content from ${url}:`, error);
      return '';
    }
  }

  public async downloadHtml(url: string, outputPath: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      // Check if response data is empty
      if (!response.data) {
        console.log('Empty response from ' + url);
        return null;
      }

      // Parse HTML and clean it
      const dom = new JSDOM(response.data);
      const document = dom.window.document;

      // Remove script and style elements
      const scripts = document.getElementsByTagName('script');
      const styles = document.getElementsByTagName('style');
      Array.from(scripts).forEach((script: Element) => script.remove());
      Array.from(styles).forEach((style: Element) => style.remove());

      // Get only the body content
      const bodyContent = document.body.innerHTML;

      // Create html directory if it doesn't exist
      const htmlDir = path.join(process.cwd(), 'html');
      if (!fs.existsSync(htmlDir)) {
        fs.mkdirSync(htmlDir, { recursive: true });
      }

      // Ensure the output path is in the html directory
      const fullOutputPath = path.join(htmlDir, path.basename(outputPath));

      // Write the cleaned HTML
      fs.writeFileSync(fullOutputPath, bodyContent);

      console.log('Successfully downloaded and cleaned HTML to ' + fullOutputPath);
      return fullOutputPath;
    } catch (error) {
      console.error('Failed to download HTML from ' + url);
      return null;
    }
  }

  async search(
    query: string,
    numResults: number = 10,
  ): Promise<
    | {
        title: string;
        link: string;
        snippet: string;
      }[]
    | null
  > {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          key: this.apiKey,
          cx: this.searchEngineId,
          q: query,
          num: numResults,
        },
      });

      const searchResultSchema = z.object({
        kind: z.literal('customsearch#result'),
        title: z.string(),
        htmlTitle: z.string(),
        link: z.string().url(),
        displayLink: z.string(),
        snippet: z.string(),
        htmlSnippet: z.string(),
        formattedUrl: z.string().url(),
        htmlFormattedUrl: z.string(),
        pagemap: z.object({
          metatags: z.array(z.any()),
          listitem: z.array(z.any()),
        }),
      });

      const items = z.array(searchResultSchema).parse(response.data.items);

      if (!items) return null;

      console.log('Items length:', items.length);

      return items.map((item) => {
        return {
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        };
      });
    } catch (error) {
      console.error(error);
      console.error('Error performing Google search:', error);
      return null;
    }
  }
}
