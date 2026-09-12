/**
 * exportService.js — Shared markdown export utility.
 *
 * Uses Tauri dialog + fs plugins to save content as a .md file.
 * Previously duplicated in OllamaScreen, OpenRouterScreen, and LMStudioScreen.
 */

/**
 * Opens a save dialog and writes content to a markdown file.
 *
 * @param {string} content - Text content to save
 * @throws {Error} If Tauri APIs are unavailable or the write fails
 */
export async function exportToMarkdown(content) {
  const dialog = window.__TAURI__?.dialog;
  const fs = window.__TAURI__?.fs;
  if (!dialog || !fs) throw new Error('Tauri APIs are not available.');

  const filePath = await dialog.save({
    title: 'Save Markdown',
    filters: [{
      name: 'Markdown',
      extensions: ['md']
    }]
  });

  if (filePath) {
    await fs.writeTextFile(filePath, content);
  }
}
