/**
 * @fileoverview Helpers for HtmlService templates (Sidebar.html, dialogs).
 */

/**
 * Embeds another file's content into a template.
 * Use with {@code createTemplateFromFile}: {@code <?!= include('path/to/file'); ?>}
 * For {@code foo.js.html}, pass {@code path/to/foo.js} (no .html).
 *
 * @param {string} filename Project path without the .html suffix
 * @return {string}
 */
function include(filename) {
  return htmlOutputFromFileSafe_(filename).getContent();
}

/**
 * Creates a template from an HTML file path, with fallback to flat file names.
 * This supports both clasp folder-style names (`src/ui/views/.../Sidebar`) and
 * bound-project flattened names (`Sidebar`).
 *
 * @param {string} filename Project path without the .html suffix
 * @return {GoogleAppsScript.HTML.HtmlTemplate}
 */
function createTemplateFromFileSafe_(filename) {
  var resolved = resolveHtmlFileName_(filename);
  return HtmlService.createTemplateFromFile(resolved);
}

/**
 * @param {string} filename
 * @return {GoogleAppsScript.HTML.HtmlOutput}
 */
function htmlOutputFromFileSafe_(filename) {
  var resolved = resolveHtmlFileName_(filename);
  return HtmlService.createHtmlOutputFromFile(resolved);
}

/**
 * Resolves HTML file references across nested and flattened Apps Script names.
 * @param {string} filename
 * @return {string}
 */
function resolveHtmlFileName_(filename) {
  var requested = String(filename || '').trim();
  if (!requested) {
    throw new Error('HTML filename is required');
  }

  var candidates = [requested];

  // If the path is rooted under "src/", also try without that prefix because
  // clasp pushes files like "src/ui/views/..." as "ui/views/..." in Apps Script.
  if (requested.indexOf('src/') === 0 && requested.length > 4) {
    candidates.push(requested.slice(4));
  }

  var slash = requested.lastIndexOf('/');
  if (slash >= 0 && slash + 1 < requested.length) {
    candidates.push(requested.slice(slash + 1));
  }

  var lastError = null;
  for (var i = 0; i < candidates.length; i++) {
    var name = candidates[i];
    try {
      // Probe the file first so we can return a clean fallback candidate.
      HtmlService.createHtmlOutputFromFile(name);
      return name;
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Unable to resolve HTML file: ' + requested);
}
