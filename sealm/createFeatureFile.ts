/*
 * GEHC CONFIDENTIAL
 *
 * Copyright (c) 2024, 2024, GE HealthCare
 * All Rights Reserved
 *
 * This unpublished material is proprietary to GE HealthCare. The methods and
 * techniques described herein are considered trade secrets and/or
 * confidential. Reproduction or distribution, in whole or in part, is
 * forbidden except by express written permission of GE HealthCare.
 * GE is a trademark of General Electric Company used under trademark license.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

import { getAllTestFiles } from './getAllTestFiles';
import { readPropertyFile, getConfigFilePath } from './readProperties';

/**
 * Ensures that the directory for the given file path exists.
 * If the directory does not exist, it will be created.
 * @param filePath - The path of the file for which the directory should be ensured.
 */
function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Extracts the requirement title from a given line of text.
 * The title is matched based on the pattern `RequirementTitle: "title"`.
 * If the title is found, it is returned; otherwise, null is returned.
 *
 * @param line - The line of text to search for the requirement title.
 * @returns The extracted requirement title, or null if not found.
 */
function handleRequirementTitle(line: string): string | null {
  const titleMatch = line.match(/RequirementTitle\:\s*["'`](.*?)["'`]/);
  if (titleMatch !== null) {
    return titleMatch[1];
  } else {
    return null;
  }
}

/**
 * Handles the `test.describe` line to extract the feature name and write it to the specified write stream.
 * If a feature name is found in the line, it writes `Feature: <feature name>`.
 * If no feature name is found, it uses the provided requirement title instead.
 *
 * @param line - The line of text to search for the `test.describe` feature name.
 * @param requirementTitle - The requirement title to use if no feature name is found in the line.
 * @param writeStream - The write stream to which the feature name or requirement title is written.
 */
function handleTestDescribe(line: string, requirementTitle: string|null, writeStream: fs.WriteStream): void {
  const featureName = line.match(/test\.describe\(["'`](.*?)["'`],/);
  if (featureName !== null && featureName !== undefined) {
    writeStream.write(`Feature: ${featureName[1]}\n\n`);
  } else if (requirementTitle !== null && requirementTitle !== undefined) {
    writeStream.write(`Feature: ${requirementTitle}\n\n`);
  }
}

function handleTestDataPath(input: string | string[], writeStream: fs.WriteStream): void {
  const lines = Array.isArray(input) ? input : [input];
  let collecting = false;
  let buffer = '';

  for (const line of lines) {
    if (/testDataPath\s*:/i.test(line)) {
      collecting = true;
      buffer += line.trim();
    } else if (collecting) {
      buffer += ` ${  line.trim()}`;
    }
  }

  if (buffer !== null) {
    const match = buffer.match(/testDataPath\s*:\s*(.+)/i);
    if (match !== null) {
      const testData = match[1].replace(/\*\/$/, '').trim();
      writeStream.write(`     #testDataPath: ${testData}\n`);
    }
  }
}

export { handleTestDataPath };

/**
 * Handles the `test` line to extract the scenario name and write it to the specified write stream.
 * If a scenario name is found in the line, it writes `Scenario: <scenario name>`.
 *
 * @param line - The line of text to search for the `test` scenario name.
 * @param writeStream - The write stream to which the scenario name is written.
 */
function handleTest(line: string, writeStream: fs.WriteStream): void {
  const configFilePath = getConfigFilePath('./packages/gv-test-cases/sealm/');
  const config = readPropertyFile(configFilePath);
  const manualTestTag = config['sealm.manualTest'];
  const automatedTestTag = config['sealm.automatedTest'];
  const scenarioWithTagsRegex = /test\(\s*["'`](.*?)["'`]\s*,\s*\{\s*tag:\s*\[([^\]]*)\]/;
  const matchWithTags = line.match(scenarioWithTagsRegex);
  if (matchWithTags !== null) {
    const scenarioName = matchWithTags[1];
    // Parse tags into an array
    const tags = matchWithTags[2]
      .split(',')
      .map((t) => t.trim().replace(/^['"]|['"]$/g, ''));

    // Check for @manual or @automation
    let specialTag = '';
    if (tags.includes('@manual')) {
      specialTag = manualTestTag;
    } else if (tags.includes('@automate')) {
      specialTag = automatedTestTag;
    }

    // Write out the scenario line
    writeStream.write(`  Scenario: ${scenarioName}${specialTag !== '' && specialTag !== null ? ` ${specialTag}` : ''}\n`);
  } else {
    // Fallback if no tag array is found
    const scenarioOnlyRegex = /test\(\s*["'`](.*?)["'`]\s*,/;
    const matchScenario = line.match(scenarioOnlyRegex);

    if (matchScenario !== null) {
      writeStream.write(`  Scenario: ${matchScenario[1]}\n`);
    }
  }

}

/**
 * Handles the `test.step` line to extract the step text and write it to the specified write stream.
 * If a step text is found in the line, it writes the step text indented to the specified write stream.
 *
 * @param line - The line of text to search for the `test.step` text.
 * @param writeStream - The write stream to which the step text is written.
 */
function handleTestStep(line: string, writeStream: fs.WriteStream): void {
  const stepText = line.match(/test\.step\(["'`](.*?)["'`],/);
  if (stepText !== null && stepText !== undefined) {
    writeStream.write(`    ${stepText[1]}\n`);
  }
}

/**
 * Writes a static 'Metadata:' line to the specified write stream.
 *
 * @param line - The line of text (not used in this function but provided for consistency with other handlers).
 * @param writeStream - The write stream to which the 'Metadata:' line is written.
 */
function handleMetadata(line: string, writeStream: fs.WriteStream): void {
  writeStream.write('Metadata:\n');
}

/**
 * Handles a key-value pair line and writes the extracted key and value to the specified write stream.
 * If a key-value pair is found in the line, it writes the key and value indented to the specified write stream.
 *
 * @param line - The line of text to search for the key-value pair.
 * @param writeStream - The write stream to which the key-value pair is written.
 */
function handleKeyValue(line: string, writeStream: fs.WriteStream): void {
  const match = line.match(/(\w+):\s*['"](.*?)['"],?/);
  if (match !== null && match !== undefined) {
    const key = match[1];
    const value = match[2];
    writeStream.write(`    ${key}: ${value}\n`);
  }
}

/**
 * Processes a line of text to determine and handle different scenarios such as requirement titles, test descriptions, and metadata.
 * The function updates the requirement title if found and writes relevant details to the specified write stream.
 *
 * @param line - The line of text to be processed.
 * @param writeStream - The write stream to which the processed information is written.
 * @param requirementTitle - The current requirement title, which may be updated based on the line content.
 * @returns The updated requirement title if found; otherwise, the original requirement title.
 */
function processLine(line: string, writeStream: fs.WriteStream, requirementTitle: string|null): string|null {
  const trimmedLine = line.trim();
  const keywords = [
    'ID:',
    'Type:',
    'Feature:',
    'Postponed:',
    'Safety:',
    'RequirementTitle:',
    'RequirementDescr:',
    'CustomTag:',
  ];

  if (trimmedLine.startsWith('RequirementTitle')) {
    requirementTitle = handleRequirementTitle(trimmedLine);

  } else if (trimmedLine.startsWith('test.describe(')) {
    handleTestDescribe(trimmedLine, requirementTitle, writeStream);
  } else if (trimmedLine.startsWith('test(')) {
    handleTest(trimmedLine, writeStream);
  } else if (trimmedLine.includes('testDataPath')) {
    handleTestDataPath(trimmedLine, writeStream);
  } else if (trimmedLine.startsWith('await test.step(')) {
    handleTestStep(trimmedLine, writeStream);
  } else if (trimmedLine.includes('const metadataSpec =')) {
    handleMetadata(trimmedLine, writeStream);
  } else  if (keywords.some(keyword => trimmedLine.startsWith(keyword))) {
    handleKeyValue(trimmedLine, writeStream);
  }

  return requirementTitle;
}

/**
 * Converts a test file to a feature file by reading the test file line by line,
 * processing each line, and writing the corresponding feature content to a new file.
 *
 * @param testFile - The name of the test file to be converted.
 * @param rootPath - The root path where the test file and feature file directories are located.
 * @returns A Promise that resolves when the conversion is complete.
 */
async function convertTestFileToFeature(testFile: string, rootPath: string): Promise<void> {
  const TEST_ROOT = path.join(rootPath, '../test-scripts/src');
  const FEATURE_ROOT = path.join(rootPath, 'features');
  const featureFilePath = path.join(FEATURE_ROOT, testFile.replace('.ts', '.feature'));
  const testFilePath = path.join(TEST_ROOT, testFile);

  ensureDirectoryExists(featureFilePath);

  const readStream = fs.createReadStream(testFilePath);
  const writeStream = fs.createWriteStream(featureFilePath);
  const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });
  let requirementTitle = '';
  let collectingBlock = false;
  let foundTestData = false;
  let commentBlock: string[] = [];

  for await (const line of rl) {
    const trimmedLine = line.trim();

    // Start of comment block
    if (trimmedLine.includes('/*')) {
      collectingBlock = true;
      foundTestData = false;
      commentBlock = [line];
      continue;
    }

    // Inside comment block
    if (collectingBlock) {
      commentBlock.push(line);
      if (/testDataPath\s*:/i.test(trimmedLine)) {
        foundTestData = true;
      }
      if (trimmedLine.includes('*/')) {
        collectingBlock = false;
        if (foundTestData) {
          handleTestDataPath(commentBlock, writeStream);
        }
        commentBlock = [];
      }
      continue;
    }
    requirementTitle = processLine(line, writeStream, requirementTitle) ?? '';
  }

  writeStream.end();
  // console.log(`Converted: ${testFile} → ${featureFilePath}`);
}

/**
 * Converts all test files in the specified root path to feature files.
 * The function processes each test file, converting it to a corresponding feature file.
 *
 * @param rootPath - The root path where the test files are located.
 * @returns A Promise that resolves when all test files have been converted.
 */
async function convertAllTests(rootPath: string): Promise<void> {
  const TEST_ROOT = path.join(rootPath, '../test-scripts/src');
  const testFiles = getAllTestFiles(TEST_ROOT);

  if (testFiles.length === 0) {
    console.log('No test files found.');
    return;
  }

  for (const file of testFiles) {
    await convertTestFileToFeature(file, rootPath);
  }

  console.log('All test files converted to feature files.');
}

export { convertAllTests };
