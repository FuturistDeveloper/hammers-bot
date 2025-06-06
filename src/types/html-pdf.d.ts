declare module 'html-pdf' {
  interface PDFOptions {
    phantomPath?: string;
    format?: string;
    border?: {
      top?: string;
      right?: string;
      bottom?: string;
      left?: string;
    };
  }

  interface PDF {
    toFile(filePath: string, callback: (error: Error | null, result?: any) => void): void;
  }

  function create(html: string, options?: PDFOptions): PDF;

  export = {
    create,
  };
}
