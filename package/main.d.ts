/** Called by Atom when activating an extension */
export declare function activate(): void;
/** Called by Atom when deactivating an extension */
export declare function deactivate(): void;
export declare const config: {
    longLineLength: {
        title: string;
        description: string;
        type: string;
        default: number;
        order: number;
    };
    largeLineCount: {
        title: string;
        description: string;
        type: string;
        default: number;
        order: number;
    };
};
