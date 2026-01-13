/**
 * Tests for toolUtil functions
 */

import {
  isWriteJsonFile,
  convertStrToObject,
  extractToolcallsFromStr
} from '../src/utils/toolUtil';
import { Toolcall } from '../src/schemas/toolCall';

describe('isWriteJsonFile', () => {
  test('should detect JSON file write with filePath parameter', () => {
    const xml = `<FileEditor.write>
      <filePath>./workspace/engineer/package.json</filePath>
      <content>{"name": "test"}</content>
    </FileEditor.write>`;
    
    expect(isWriteJsonFile(xml, 'FileEditor.write')).toBe(true);
  });

  test('should detect JSON file write with path parameter', () => {
    const xml = `<FileEditor.write>
      <path>./test.json</path>
      <content>{"test": true}</content>
    </FileEditor.write>`;
    
    expect(isWriteJsonFile(xml, 'FileEditor.write')).toBe(true);
  });

  test('should detect JSON file write with apiFilePath parameter', () => {
    const xml = `<ApiTool.write>
      <apiFilePath>./test.json</apiFilePath>
      <content>{"api": "content"}</content>
    </ApiTool.write>`;
    
    expect(isWriteJsonFile(xml, 'ApiTool.write')).toBe(true);
  });

  test('should not detect non-JSON file write', () => {
    const xml = `<FileEditor.write>
      <filePath>./test.md</filePath>
      <content>markdown content</content>
    </FileEditor.write>`;
    
    expect(isWriteJsonFile(xml, 'FileEditor.write')).toBe(false);
  });

  test('should not detect for non-file tools', () => {
    const xml = `<CommandLineTool.execute>
      <command>echo "test.json"</command>
    </CommandLineTool.execute>`;
    
    expect(isWriteJsonFile(xml, 'CommandLineTool.execute')).toBe(false);
  });
});

describe('convertStrToObject', () => {
  test('should keep content as string when writing JSON file', () => {
    const xml = `<FileEditor.write>
      <path>./package.json</path>
      <content>{
  "name": "test-project",
  "version": "1.0.0"
}</content>
    </FileEditor.write>`;

    const result = convertStrToObject(xml, 'FileEditor.write', ['path', 'content']);

    expect(result.path).toBe('./package.json');
    expect(result.content).toBe(`{
  "name": "test-project",
  "version": "1.0.0"
}`);
    expect(typeof result.content).toBe('string');
  });

  test('should parse JSON content for non-JSON files', () => {
    const xml = `<CommandLineTool.execute>
      <command>{"test": true}</command>
    </CommandLineTool.execute>`;
    
    const result = convertStrToObject(xml, 'CommandLineTool.execute', ['command']);
    
    // Since it's not a JSON file write, it should try to parse JSON
    expect(result.command).toEqual({ test: true });
  });

  test('should handle arrays correctly', () => {
    const xml = `<CSVEditor.create>
      <columns>["a", "b", "c"]</columns>
      <cells>[[1,2,3], [4,5,6]]</cells>
    </CSVEditor.create>`;
    
    const result = convertStrToObject(xml, 'CSVEditor.create', ['columns', 'cells']);
    
    expect(result.columns).toEqual(["a", "b", "c"]);
    expect(result.cells).toEqual([[1,2,3], [4,5,6]]);
  });

  test('should keep as string if JSON parsing fails', () => {
    const xml = `<Tool.test>
      <param>not a valid json {</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);

    expect(result.param).toBe('not a valid json {');
    expect(typeof result.param).toBe('string');
  });
});

describe('unescapeHtmlEntities (via convertStrToObject)', () => {
  test('should unescape named entities', () => {
    const xml = `<Tool.test>
      <param>&quot;Hello &amp; goodbye&quot;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    // After unescaping &quot; -> ", the value becomes a valid JSON string which gets parsed
    expect(result.param).toBe('Hello & goodbye');
  });

  test('should unescape numeric decimal entities', () => {
    const xml = `<Tool.test>
      <param>&#34;quoted&#34;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    // After unescaping &#34; -> ", the value becomes a valid JSON string which gets parsed
    expect(result.param).toBe('quoted');
  });

  test('should unescape numeric hex entities', () => {
    const xml = `<Tool.test>
      <param>&#x22;hex&#x22;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    // After unescaping &#x22; -> ", the value becomes a valid JSON string which gets parsed
    expect(result.param).toBe('hex');
  });

  test('should handle mixed entity types', () => {
    const xml = `<Tool.test>
      <param>&lt;&#34;mixed&#x22;&gt;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toBe('<"mixed">');
  });

  test('should not break JSON parsing after unescaping', () => {
    const xml = `<Tool.test>
      <param>{&quot;key&quot;: &quot;value&quot;}</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toEqual({ key: 'value' });
  });

  test('should handle double-escaped entities correctly', () => {
    const xml = `<Tool.test>
      <param>&amp;quot;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toBe('&quot;');
  });

  test('should unescape all common named entities', () => {
    const xml = `<Tool.test>
      <param>&lt;&gt;&amp;&apos;&quot;</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toBe('<>&\'"');
  });

  test('should handle mixed text and entities', () => {
    const xml = `<Tool.test>
      <param>Price: &#36;100 &amp; shipping: &#36;10</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toBe('Price: $100 & shipping: $10');
  });

  test('should preserve text without entities', () => {
    const xml = `<Tool.test>
      <param>Plain text without any entities</param>
    </Tool.test>`;

    const result = convertStrToObject(xml, 'Tool.test', ['param']);
    expect(result.param).toBe('Plain text without any entities');
  });
});

describe('extractToolcallsFromStr', () => {
  test('should extract FileEditor.write toolcall with JSON content preserved as string', () => {
    const txt = `<FileEditor.write>
<path>./workspace/engineer/package.json</path>
<content>{
  "name": "ocr-frontend",
  "version": "1.0.0",
  "type": "module",
  "description": "图片OCR识别前端应用"
}</content>
</FileEditor.write>`;

    const mockToolStore = {
      'FileEditor.write': {
        argNames: ['path', 'content'],
      },
    };

    const toolcalls = extractToolcallsFromStr(txt, mockToolStore);

    expect(toolcalls).toHaveLength(1);
    expect(toolcalls[0].name).toBe('FileEditor.write');
    expect(toolcalls[0].input.path).toBe('./workspace/engineer/package.json');
    expect(typeof toolcalls[0].input.content).toBe('string');
    expect(toolcalls[0].input.content).toContain('"name": "ocr-frontend"');
  });
});

