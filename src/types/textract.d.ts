declare module 'textract' {
    interface TextractOptions {
        preserveLineBreaks?: boolean;
        preserveOnlyMultipleLineBreaks?: boolean;
    }

    function fromFileWithPath(
        filePath: string, 
        options: TextractOptions, 
        callback: (error: Error | null, text?: string) => void
    ): void;

    export = {
        fromFileWithPath
    };
} 