declare module 'xlsx' {
  interface Sheet {
    [key: string]: any;
  }

  interface Workbook {
    SheetNames: string[];
    Sheets: { [key: string]: Sheet };
  }

  function readFile(filename: string, opts?: { cellDates?: boolean }): Workbook;
  const utils: {
    sheet_to_csv: (ws: Sheet, opts?: { FS?: string; RS?: string }) => string;
  };

  export = {
    readFile,
    utils,
  };
}
