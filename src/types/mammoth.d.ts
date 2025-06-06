declare module 'mammoth' {
    interface ConversionResult {
        value: string;
        messages: any[];
    }

    interface Options {
        buffer: Buffer;
    }

    function convertToHtml(options: Options): Promise<ConversionResult>;

    export = {
        convertToHtml
    };
} 