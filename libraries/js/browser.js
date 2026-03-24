const core = globalThis.declaradigmsCore;

if (!core) {
  throw new Error('declaradigmsCore is not loaded. Include ../core.js before importing browser.js.');
}

export const toArray = core.toArray;
export const escapeHtml = core.escapeHtml;
export const stringifyLookupOutput = core.stringifyLookupOutput;
export const extractTagVariables = core.extractTagVariables;
export const selectParadigm = core.selectParadigm;
export const generateTableModel = core.generateTableModel;
export const renderTableModelToHtml = core.renderTableModelToHtml;
