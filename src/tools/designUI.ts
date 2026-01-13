/**
 * WriteUIDesignDocument - Tool for writing UI Design Document files
 *
 * Converts Python's design_ui.py to TypeScript
 */

import { tools } from './toolRegister';
import { FileEditor } from './fileTool';

/**
 * WriteUIDesignDocument class for UI design document operations
 */
@tools({
    write: {
        description: 'Use the tool to write UI Design Document files.',
        params: [
            {
                name: 'uiDesignDocumentFileDir',
                type: 'str',
                description: 'The UI Design Document file directory to write.',
            },
            {
                name: 'elements',
                type: 'List[Dict]',
                description: 'The elements to write.',
            },
            {
                name: 'composites',
                type: 'List[Dict]',
                description: 'The composites to write.',
            },
            { name: 'pages', type: 'List[Dict]', description: 'The pages to write.' },
            {
                name: 'functions',
                type: 'List[Dict]',
                description: 'The functions to write.',
            },
            {
                name: 'styles',
                type: 'List[Dict]',
                description: 'The styles to write.',
            },
        ],
        returns: {
            type: 'str',
            description: 'The complete UI Design Document files result.',
        },
    },
})
export class WriteUIDesignDocument {
    async write(
        uiDesignDocumentFileDir: string,
        elements: Record<string, any>[],
        composites: Record<string, any>[],
        pages: Record<string, any>[],
        functions: Record<string, any>[],
        styles: Record<string, any>[]
    ): Promise<string> {
        const fileEditor = new FileEditor();

        await fileEditor.write(`${uiDesignDocumentFileDir}/AtomicElements.json`, JSON.stringify(elements, null, 2));
        await fileEditor.write(`${uiDesignDocumentFileDir}/Composites.json`, JSON.stringify(composites, null, 2));
        await fileEditor.write(`${uiDesignDocumentFileDir}/Pages.json`, JSON.stringify(pages, null, 2));
        await fileEditor.write(`${uiDesignDocumentFileDir}/Functions.json`, JSON.stringify(functions, null, 2));
        await fileEditor.write(`${uiDesignDocumentFileDir}/Styles.json`, JSON.stringify(styles, null, 2));

        return `Write UI Design Document files ${uiDesignDocumentFileDir} complete!`;
    }
}
