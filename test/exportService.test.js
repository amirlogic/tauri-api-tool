import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToMarkdown } from '../src/services/exportService.js';

describe('exportService.js - Dialog & FS IPC integration', () => {
  beforeEach(() => {
    window.__TAURI__.dialog = {
      save: vi.fn(),
    };
    window.__TAURI__.fs = {
      writeTextFile: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('throws error when dialog or fs plugins are missing', async () => {
    window.__TAURI__.dialog = undefined;
    await expect(exportToMarkdown('# Title')).rejects.toThrow(
      'Tauri APIs are not available.'
    );

    window.__TAURI__.dialog = { save: vi.fn() };
    window.__TAURI__.fs = undefined;
    await expect(exportToMarkdown('# Title')).rejects.toThrow(
      'Tauri APIs are not available.'
    );
  });

  it('prompts user with dialog.save and writes markdown file on confirmation', async () => {
    window.__TAURI__.dialog.save.mockResolvedValueOnce('C:\\Users\\test\\chat.md');

    await exportToMarkdown('# Conversation Log\n\n- Hello');

    expect(window.__TAURI__.dialog.save).toHaveBeenCalledWith({
      title: 'Save Markdown',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });

    expect(window.__TAURI__.fs.writeTextFile).toHaveBeenCalledWith(
      'C:\\Users\\test\\chat.md',
      '# Conversation Log\n\n- Hello'
    );
  });

  it('does not write to file if user cancels save dialog', async () => {
    window.__TAURI__.dialog.save.mockResolvedValueOnce(null);

    await exportToMarkdown('# Unsaved Conversation');

    expect(window.__TAURI__.dialog.save).toHaveBeenCalled();
    expect(window.__TAURI__.fs.writeTextFile).not.toHaveBeenCalled();
  });
});
