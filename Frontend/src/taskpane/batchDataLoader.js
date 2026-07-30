const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_WRITE_BATCH_SIZE = 20;

/**
 * @param {Excel.RequestContext} context
 * @param {Excel.Worksheet} sheet
 * @param {string} startColumn
 * @param {string} endColumn
 * @param {number} startRow
 * @param {any[][]} rows
 * @param {number} [batchSize=20]
 */
export async function writeRowsInBatches(
  context,
  sheet,
  startColumn,
  endColumn,
  startRow,
  rows,
  batchSize = DEFAULT_WRITE_BATCH_SIZE
) {
  if (!rows || rows.length === 0) return;

  let offset = 0;
  while (offset < rows.length) {
    const batchData = rows.slice(offset, offset + batchSize);
    const batchStartRow = startRow + offset;
    const batchEndRow = batchStartRow + batchData.length - 1;

    try {
      const range = sheet.getRange(`${startColumn}${batchStartRow}:${endColumn}${batchEndRow}`);
      range.values = batchData;
      await context.sync();
    } catch (error) {
      throw new Error(
        `writeRowsInBatches: failed writing rows ${batchStartRow}-${batchEndRow} to ${startColumn}:${endColumn}: ${error.message || error}`
      );
    }

    offset += batchSize;
  }
}

/**
 * @param {(offset: number, batchSize: number) => Promise<any[]>} fetchBatch
 * @param {Object} [options]
 * @param {number} [options.batchSize=100]
 * @returns {Promise<any[]>}
 */
export async function fetchAllInBatches(fetchBatch, options = {}) {
  const { batchSize = DEFAULT_BATCH_SIZE } = options;

  if (typeof fetchBatch !== "function") {
    throw new Error("fetchAllInBatches: fetchBatch must be a function.");
  }
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("fetchAllInBatches: batchSize must be a positive integer.");
  }

  const allData = [];
  let offset = 0;

  while (true) {
    let batchData;
    try {
      batchData = await fetchBatch(offset, batchSize);
    } catch (error) {
      throw new Error(`fetchAllInBatches: failed fetching batch at offset ${offset}: ${error.message || error}`);
    }

    if (!Array.isArray(batchData)) {
      throw new Error("fetchAllInBatches: fetchBatch must resolve to an array.");
    }

    if (batchData.length === 0) {
      break;
    }

    allData.push(...batchData);
    offset += batchData.length;
  }

  return allData;
}

/**
 * @param {Excel.RequestContext} context
 * @param {Excel.Worksheet} sheet
 * @param {number} offset
 * @param {number} batchSize
 * @param {Object} [config]
 * @param {number} [config.startRow=1]
 * @param {number} [config.startColumn=0]
 * @param {number} [config.columnCount]
 * @returns {Promise<any[][]>}
 */
export async function readNextBatchFromWorksheet(context, sheet, offset, batchSize, config = {}) {
  const { startRow = 1, startColumn = 0 } = config;
  let { columnCount } = config;

  if (columnCount === undefined) {
    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load("columnCount");
    await context.sync();
    columnCount = usedRange.isNullObject ? 1 : usedRange.columnCount;
  }

  const absoluteRow = startRow + offset;

  let range;
  try {
    range = sheet.getRangeByIndexes(absoluteRow, startColumn, batchSize, columnCount);
    range.load("values");
    await context.sync();
  } catch (error) {
    throw new Error(
      `readNextBatchFromWorksheet: failed reading rows at offset ${offset}: ${error.message || error}`
    );
  }

  return trimTrailingEmptyRows(range.values);
}

function isRowEmpty(row) {
  return row.every((cell) => cell === "" || cell === null || cell === undefined);
}

function trimTrailingEmptyRows(rows) {
  let end = rows.length;
  while (end > 0 && isRowEmpty(rows[end - 1])) {
    end -= 1;
  }
  return rows.slice(0, end);
}

/**
 * @param {Object} options
 * @param {string} [options.sheetName]
 * @param {number} [options.batchSize=100]
 * @param {number} [options.startRow=1]
 * @param {(allData: any[][]) => (void | Promise<void>)} options.onComplete
 * @returns {Promise<number>}
 */
export async function loadAllWorksheetDataInBatches(options = {}) {
  const { sheetName, batchSize = DEFAULT_BATCH_SIZE, startRow = 1, onComplete } = options;

  if (typeof onComplete !== "function") {
    throw new Error("loadAllWorksheetDataInBatches: options.onComplete must be a function.");
  }

  let allData = [];

  try {
    await Excel.run(async (context) => {
      const sheet = sheetName
        ? context.workbook.worksheets.getItem(sheetName)
        : context.workbook.worksheets.getActiveWorksheet();

      allData = await fetchAllInBatches(
        (offset, size) => readNextBatchFromWorksheet(context, sheet, offset, size, { startRow }),
        { batchSize }
      );
    });
  } catch (error) {
    if (typeof OfficeExtension !== "undefined" && error instanceof OfficeExtension.Error) {
      console.error("Excel API error:", error.code, error.message, error.debugInfo);
    } else {
      console.error("loadAllWorksheetDataInBatches failed:", error);
    }
    throw error;
  }

  await onComplete(allData);

  return allData.length;
}

/**
 * @param {Excel.RequestContext} context
 * @param {Excel.Worksheet} sheet
 * @param {any[][]} allData
 * @param {Object} [config]
 * @param {number} [config.startRow=1]
 * @param {number} [config.startColumn=0]
 */
export async function writeAllDataToExcelOnce(context, sheet, allData, config = {}) {
  if (!allData || allData.length === 0) return;

  const { startRow = 1, startColumn = 0 } = config;
  const columnCount = allData[0].length;

  try {
    const range = sheet.getRangeByIndexes(startRow, startColumn, allData.length, columnCount);
    range.values = allData;
    await context.sync();
  } catch (error) {
    throw new Error(`writeAllDataToExcelOnce: failed writing ${allData.length} row(s): ${error.message || error}`);
  }
}

/**
 * @param {Object} options
 * @param {(offset: number, batchSize: number) => Promise<any[][]>} options.fetchBatch
 * @param {string} [options.sheetName]
 * @param {number} [options.batchSize=100]
 * @param {number} [options.startRow=1]
 * @param {number} [options.startColumn=0]
 * @returns {Promise<number>}
 */
export async function fetchAllRecordsAndWriteToExcel(options = {}) {
  const { fetchBatch, sheetName, batchSize = DEFAULT_BATCH_SIZE, startRow = 1, startColumn = 0 } = options;

  if (typeof fetchBatch !== "function") {
    throw new Error("fetchAllRecordsAndWriteToExcel: options.fetchBatch must be a function.");
  }

  const allData = await fetchAllInBatches(fetchBatch, { batchSize });

  try {
    await Excel.run(async (context) => {
      const sheet = sheetName
        ? context.workbook.worksheets.getItem(sheetName)
        : context.workbook.worksheets.getActiveWorksheet();

      await writeAllDataToExcelOnce(context, sheet, allData, { startRow, startColumn });
    });
  } catch (error) {
    if (typeof OfficeExtension !== "undefined" && error instanceof OfficeExtension.Error) {
      console.error("Excel API error:", error.code, error.message, error.debugInfo);
    } else {
      console.error("fetchAllRecordsAndWriteToExcel failed:", error);
    }
    throw error;
  }

  return allData.length;
}
