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

import { uploadTestCase, getItemTypeId, getTestCaseIdFromItemId, updateTestCase } from './connectSealm';
import { convertAllTests } from './createFeatureFile';
import { getAccessToken } from './getJamaAccessToken';
import { readPropertyFile, getConfigFilePath } from './readProperties';

const regexToCheckImodify = /@modify/;
const regexToCheckIDInTestCase = /@SEGVR\S*/;

/**
 * Recursively retrieves all files with a specific extension from a directory and its subdirectories.
 * @param dir - The directory to search within.
 * @param ext - The file extension to look for (e.g., '.feature').
 * @param fileList - Accumulator for the file paths.
 * @returns - List of file paths matching the extension.
 */
function getAllFiles(dir: string, ext: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getAllFiles(filePath, ext, fileList);
    } else if (path.extname(file) === ext) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

/**
 * Handles a line containing an ID, extracts the item ID, and fetches the item type.
 * The function reads the item ID from the provided line, retrieves the item type using a separate function, and returns both.
 *
 * @param trimmedLine - The trimmed line of text containing the item ID.
 * @param token - The access token for authentication.
 * @param filePath - The file path where additional data may be located.
 * @param rootPath - The root path for resolving relative paths.
 * @returns A Promise that resolves with an object containing the item ID and item type.
 */
async function handleIDLine(trimmedLine: string, token: string, filePath: string, rootPath: string): Promise<{ itemId: string | null; itemType: string | null }> {
  const itemTypeArray = trimmedLine.match(/ID:\s*(.*)/);
  let itemId: string | null = null;
  let itemType: string | null = null;
  if (itemTypeArray !== null && itemTypeArray[1] !== undefined) {
    itemId = itemTypeArray[1].trim();
    itemType = await getItemTypeId(itemId, token, filePath, rootPath);
  }
  return { itemId, itemType };
}

/**
 * Creates a step object containing action, expected result, and notes from the provided arrays of current steps and expected results.
 * The function concatenates the current steps and expected results using '<br>' for HTML line breaks and returns an object with the structured data.
 *
 * @param currentSteps - An array of strings representing the current steps of the test.
 * @param allExpected - An array of strings representing the expected results of the test.
 * @returns A Promise that resolves with an object containing action, expectedResult, and notes.
 */
async function createStep(
  currentSteps: string[],
  allExpected: string[]
): Promise<{ action: string; expectedResult: string; notes: string }> {
  return {
    action: currentSteps.join('<br>'),
    expectedResult: allExpected.join('<br>'),
    notes: '',
  };
}

/**
 * Creates the final JSON string by replacing placeholders in the provided template with actual values.
 * The function reads configuration values from a properties file and substitutes them, along with other parameters, into the template.
 *
 * @param templateContentForFinalJson - The template string for the final JSON.
 * @param itemType - The item type to be inserted into the JSON template.
 * @param itemId - The item ID to be inserted into the JSON template.
 * @param ScenarioToPrint - The scenario name to be inserted as both the name and description in the JSON template.
 * @param testCaseSteps - An array of test case steps to be inserted into the JSON template.
 * @param rootPath - The root path where the configuration properties file is located.
 * @returns A Promise that resolves with the final JSON string.
 */
async function createFinalJson(
  templateContentForFinalJson: string,
  itemType: string | null,
  itemId: string | null,
  ScenarioToPrint: string | null,
  testCaseSteps: any[],
  rootPath: string,
  notes: string,
  executionMethod: number[] | null
): Promise<string> {
  const propertyFilePathForJson = getConfigFilePath(rootPath);
  if (ScenarioToPrint !== null) {
    ScenarioToPrint = ScenarioToPrint.replace(new RegExp('\\s*@modify', 'g'), '');
    ScenarioToPrint = ScenarioToPrint.replace(/@SEGVR\S*\s/, '');
  }
  const configForJson = readPropertyFile(propertyFilePathForJson);
  return templateContentForFinalJson
    .replace('{{projectId}}', JSON.stringify(configForJson['sealm.projectID'], null, 2))
    .replace('{{itemTypeId}}', JSON.stringify(itemType, null, 2))
    .replace('{{itemId}}', JSON.stringify(itemId, null, 2))
    .replace('{{name}}', JSON.stringify(ScenarioToPrint, null, 2))
    .replace('{{description}}', JSON.stringify(ScenarioToPrint, null, 2))
    .replace('{{testCaseSteps}}', JSON.stringify(testCaseSteps, null, 2))
    .replace('{{notes}}', JSON.stringify(notes, null, 2))
    .replace('{{executionMethod}}', JSON.stringify(executionMethod ?? [], null, 2));
}

/**
 * Checks if the given scenario is a new test case based on the scenario name and the test case steps.
 * The function uses a regular expression to check for an ID in the scenario name and ensures there are steps in the test case.
 *
 * @param ScenarioToPrint - The scenario name to check for an ID.
 * @param testCaseSteps - An array of test case steps.
 * @returns A boolean indicating whether the scenario is a new test case.
 */
function isNewTestCase(ScenarioToPrint: string, testCaseSteps: any[]): boolean {
  return !regexToCheckIDInTestCase.test(ScenarioToPrint) && testCaseSteps.length > 0;
}

/**
 * Checks if the given scenario is an existing test case based on the scenario name.
 * The function uses a regular expression to check for an ID in the scenario name and ensures the scenario does not include '@modify'.
 *
 * @param ScenarioToPrint - The scenario name to check for an ID.
 * @returns A boolean indicating whether the scenario is an existing test case.
 */
function isExistingTestCase(ScenarioToPrint: string): boolean {
  return regexToCheckIDInTestCase.test(ScenarioToPrint) && !ScenarioToPrint.includes('@modify');
}

/**
 * Checks if the given scenario is a modify test case based on the scenario name.
 * The function uses a regular expression to check for the pattern associated with modify test cases in the scenario name.
 *
 * @param ScenarioToPrint - The scenario name to check for the modify pattern.
 * @returns A boolean indicating whether the scenario is a modify test case.
 */
function isModifyTestCase(ScenarioToPrint: string): boolean {
  return regexToCheckImodify.test(ScenarioToPrint);
}

/**
 * Updates an existing test case by fetching the test case ID using the provided item ID and token,
 * and then updating the test case with the final JSON content.
 * The function checks the scenario name for a document ID and proceeds with the update if the document ID and test case ID are found.
 *
 * @param finalJson - The final JSON content to update the test case with.
 * @param token - The access token for authentication.
 * @param ScenarioToPrint - The scenario name that may contain the document ID.
 * @param itemId - The item ID to be used for fetching the test case ID.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 * @returns A Promise that resolves when the test case has been updated.
 */
async function updateExistingTestCase(
  finalJson: string,
  token: string,
  ScenarioToPrint: string | null,
  itemId: string | null,
  rootPath: string
): Promise<void> {
  if (ScenarioToPrint !== '' && ScenarioToPrint !== null) {
    let documentId: string | null = null;
    const match = ScenarioToPrint.match(/@SEGVR\S*/);
    if (match !== null) {
      documentId = match[0].replace('@', '');
    }

    if (documentId !== null) {
      const testCaseItemId = await getTestCaseIdFromItemId(itemId, token, documentId, rootPath);
      if (testCaseItemId !== null) {
        await updateTestCase(finalJson, token, testCaseItemId, rootPath);
      } else {
        console.error('TestCaseItemId is null or empty');
      }
    } else {
      console.error('DocumentId is null or empty');
    }
  }
}

/**
 * Handles the upload or update of a test case based on the scenario name and test case steps.
 * The function determines whether the test case is new, existing, or needs modification, and performs the appropriate action.
 *
 * @param finalJson - The final JSON content of the test case.
 * @param token - The access token for authentication.
 * @param ScenarioToPrint - The scenario name of the test case.
 * @param itemId - The item ID associated with the test case.
 * @param testCaseSteps - An array of test case steps.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 * @returns A Promise that resolves when the upload or update process is complete.
 */
async function handleUploadOrUpdate(
  finalJson: string,
  token: string,
  ScenarioToPrint: string,
  itemId: string | null,
  testCaseSteps: any[],
  rootPath: string
): Promise<void> {
  if (isNewTestCase(ScenarioToPrint, testCaseSteps)) {
    await uploadTestCase(finalJson, token, rootPath);
  } else if (isExistingTestCase(ScenarioToPrint)) {
    console.log(`❎Scenario is already uploaded-${ScenarioToPrint}`);
  } else if (isModifyTestCase(ScenarioToPrint)) {
    await updateExistingTestCase(finalJson, token, ScenarioToPrint, itemId, rootPath);
  }
}

/**
 * Uploads or updates a test case based on the provided scenario and test case steps.
 * The function checks if the scenario name is not null or empty and then handles the upload or update process.
 *
 * @param finalJson - The final JSON content of the test case.
 * @param token - The access token for authentication.
 * @param ScenarioToPrint - The scenario name of the test case.
 * @param itemId - The item ID associated with the test case.
 * @param testCaseSteps - An array of test case steps.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 * @returns A Promise that resolves when the upload or update process is complete.
 */
async function uploadOrUpdateTestCase(
  finalJson: string,
  token: string,
  ScenarioToPrint: string | null,
  itemId: string | null,
  testCaseSteps: any[],
  rootPath: string
): Promise<void> {
  if (ScenarioToPrint !== null && ScenarioToPrint !== '') {
    await handleUploadOrUpdate(finalJson, token, ScenarioToPrint, itemId, testCaseSteps, rootPath);
  }
}

/**
 * Handles a scenario line by updating the test case steps, creating the final JSON,
 * and either uploading or updating the test case as needed.
 * The function checks if the test case is ready to be pushed and processes it accordingly.
 *
 * @param readyToPush - A boolean indicating whether the test case is ready to be pushed.
 * @param currentSteps - An array of strings representing the current steps of the test case.
 * @param allExpected - An array of strings representing the expected results of the test case.
 * @param currentScenario - A RegExpMatchArray representing the current scenario name.
 * @param ScenarioToPrint - The scenario name to print in the test case.
 * @param testCaseSteps - An array of test case steps.
 * @param token - The access token for authentication.
 * @param itemType - The item type associated with the test case.
 * @param itemId - The item ID associated with the test case.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 * @returns A Promise that resolves with an object containing the updated state of readyToPush, currentSteps, allExpected, ScenarioToPrint, currentScenario, and testCaseSteps.
 */
async function handleScenarioLine(
  readyToPush: boolean,
  currentSteps: string[],
  allExpected: string[],
  currentScenario: RegExpMatchArray | null,
  ScenarioToPrint: string | null,
  testCaseSteps: any[],
  token: string,
  itemType: string | null,
  itemId: string | null,
  rootPath: string,
  notes: string[],
  executionMethod: number[] | null
): Promise<{ readyToPush: boolean; currentSteps: string[]; allExpected: string[]; ScenarioToPrint: string | null; currentScenario: RegExpMatchArray | null; testCaseSteps: any[] }> {
  const propertyFilePathForScenarioLine = getConfigFilePath(rootPath);
  const configForScenarioLine = readPropertyFile(propertyFilePathForScenarioLine);
  const templatePathForScenarioLine = path.join(rootPath, configForScenarioLine['sealm.payLoadTemlatePath']);
  const templateContent = fs.readFileSync(templatePathForScenarioLine, 'utf-8');

  if (readyToPush) {
    testCaseSteps.push(await createStep(currentSteps, allExpected));
    if (currentScenario !== null) {
      ScenarioToPrint = currentScenario[1].trim();
    }
    if (ScenarioToPrint !== null) {
      const finalJson = await createFinalJson(templateContent, itemType, itemId, ScenarioToPrint.replace(/@\b(?:SEGVR|modify)\S*/g, '').trim(), testCaseSteps, rootPath, notes.join('<br>'), executionMethod ?? null);
      await uploadOrUpdateTestCase(finalJson, token, ScenarioToPrint, itemId, testCaseSteps, rootPath);
    }
    readyToPush = false;
  } else if (currentSteps.length > 0) {
    if (currentScenario !== null) {
      ScenarioToPrint = currentScenario[1].trim();
      console.log(`❌Scenario not in GWT format: ${currentScenario[1]}`);
    }
  }
  currentSteps = [];
  allExpected = [];
  testCaseSteps = [];
  notes = [];

  return { readyToPush, currentSteps, allExpected, ScenarioToPrint, currentScenario, testCaseSteps };
}

/**
 * Handles a step line by updating the current steps, expected results, and test case steps.
 * If there are any expected results, it creates a step and resets the current steps and expected results.
 *
 * @param trimmedLine - The trimmed line of text representing a test step.
 * @param currentSteps - An array of strings representing the current steps of the test case.
 * @param allExpected - An array of strings representing the expected results of the test case.
 * @param testCaseSteps - An array of test case steps.
 * @returns A Promise that resolves with an object containing the updated currentSteps, allExpected, and testCaseSteps.
 */
async function handleStepLine(
  trimmedLine: string,
  currentSteps: string[],
  allExpected: string[],
  testCaseSteps: any[]
): Promise<{ currentSteps: string[]; allExpected: string[]; testCaseSteps: any[] }> {
  if (allExpected.length !== 0) {
    testCaseSteps.push(await createStep(currentSteps, allExpected));
    currentSteps = [];
    allExpected = [];
  }
  currentSteps.push(trimmedLine);
  return { currentSteps, allExpected, testCaseSteps };
}

/**
 * Handles a 'Then' line in a test scenario by updating the expected results and scenario name.
 * The function appends the trimmed line to the expected results, updates the scenario name if available,
 * and sets the readyToPush flag to true.
 *
 * @param trimmedLine - The trimmed line of text representing a 'Then' step in the test case.
 * @param allExpected - An array of strings representing the expected results of the test case.
 * @param ScenarioToPrint - The scenario name to print in the test case.
 * @param currentScenario - A RegExpMatchArray representing the current scenario name.
 * @returns A Promise that resolves with an object containing the updated readyToPush flag, allExpected array, and ScenarioToPrint.
 */
async function handleThenLine(
  trimmedLine: string,
  allExpected: string[],
  ScenarioToPrint: string | null,
  currentScenario: RegExpMatchArray | null
): Promise<{ readyToPush: boolean; allExpected: string[]; ScenarioToPrint: string | null }> {
  allExpected.push(trimmedLine);
  if (currentScenario !== null) {
    ScenarioToPrint = currentScenario[1].trim();
  }
  return { readyToPush: true, allExpected, ScenarioToPrint };
}

/**
 * Processes the last test case by creating a step, generating the final JSON,
 * and either uploading or updating the test case as needed.
 * The function checks if the scenario name is not null, creates a step, and handles the test case accordingly.
 *
 * @param currentSteps - An array of strings representing the current steps of the test case.
 * @param allExpected - An array of strings representing the expected results of the test case.
 * @param ScenarioToPrint - The scenario name to print in the test case.
 * @param testCaseSteps - An array of test case steps.
 * @param itemType - The item type associated with the test case.
 * @param itemId - The item ID associated with the test case.
 * @param tokenForLast - The access token for authentication.
 * @param currentScenario - A RegExpMatchArray representing the current scenario name.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 * @returns A Promise that resolves when the processing of the last test case is complete.
 */
async function processLastTestcase(
  currentSteps: string[],
  allExpected: string[],
  ScenarioToPrint: string | null,
  testCaseSteps: any[],
  itemType: string | null,
  itemId: string | null,
  tokenForLast: string,
  currentScenario: RegExpMatchArray | null,
  rootPath: string,
  notes: string[],
  executionMethod: number[] | null
): Promise<void> {
  const propertyFilePathForLastTestcase = getConfigFilePath(rootPath);
  const configForLastTestcase = readPropertyFile(propertyFilePathForLastTestcase);
  const templatePathForLastTestcase = path.join(rootPath, configForLastTestcase['sealm.payLoadTemlatePath']);
  const templateContentForLastTestcase = fs.readFileSync(templatePathForLastTestcase, 'utf-8');
  if (ScenarioToPrint !== null) {
    testCaseSteps.push(await createStep(currentSteps, allExpected));
    if (allExpected.length > 0) {
      const finalJson = await createFinalJson(templateContentForLastTestcase, itemType, itemId, ScenarioToPrint, testCaseSteps, rootPath, notes.join('<br>'), executionMethod ?? null);
      await uploadOrUpdateTestCase(finalJson, tokenForLast, ScenarioToPrint, itemId, testCaseSteps, rootPath);
    } else {
      if (currentScenario !== null) {
        console.log(`❌Scenario not in GWT format: ${currentScenario[1]}`);
      }
    }
  }
}

/**
 * Processes a feature file to extract scenarios, steps, and expected results.
 * @param filePath - The path to the feature file.
 * @param token - The authentication token.
 * @param rootPath - The root path for resolving relative paths and configuration files.
 */
async function processFeatureFile(filePath: string, token: string, rootPath: string): Promise<void> {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const manualTestTag = parseInt(config['sealm.manualTest'], 10); // Fetch manual test tag
  const automatedTestTag = parseInt(config['sealm.automatedTest'], 10); // Fetch automated test tag

  let currentScenario: RegExpMatchArray | null = null;
  let currentSteps: string[] = [];
  let testCaseSteps: any[] = [];
  let ScenarioToPrint: string | null = null;
  let itemType: string | null = null;
  let itemId: string | null = null;
  let readyToPush = false;
  let allExpected: string[] = [];
  let notes: string[] = [];
  let executionMethod: number[] | null = null;

  for await (const line of rl) {
    const trimmedLine = line.trim();
    console.log(trimmedLine);

    if (trimmedLine.startsWith('ID:')) {
      ({ itemId, itemType } = await handleIDLine(trimmedLine, token, filePath, rootPath));
      if (itemType == null) {
        break;
      }
    } else if (trimmedLine.startsWith('Scenario:')) {
      let scenarioText = trimmedLine.replace(/^Scenario:\s*/, '').trim();
      // Check for optional "@manual" or "@automated" in the scenario
      // Example: "Scenario: My scenario name @manual"
      const categoryMatch = scenarioText.match(new RegExp(`(${manualTestTag}|${automatedTestTag})`));
      executionMethod = null;
      if (categoryMatch !== null) {
        executionMethod = [parseInt(categoryMatch[1], 10)];
        // Remove the tag from the scenario text
        scenarioText = scenarioText.replace(categoryMatch[1], '').trim();
      }

      // Store final scenario text in currentScenario for later
      currentScenario = [scenarioText, scenarioText] as RegExpMatchArray;

      // currentScenario = trimmedLine.match(/Scenario:\s*(.*)/);
      ({
        readyToPush,
        currentSteps,
        allExpected,
        ScenarioToPrint,
        currentScenario,
        testCaseSteps,
      } = await handleScenarioLine(
        readyToPush,
        currentSteps,
        allExpected,
        currentScenario,
        ScenarioToPrint,
        testCaseSteps,
        token,
        itemType,
        itemId,
        rootPath,
        notes,
        executionMethod
      ));

    } else if (trimmedLine.startsWith('#testDataPath:')) {
      const note = trimmedLine.replace('#testDataPath:', '').trim();
      notes.push(note.replace(/,\s*/g, '<br>'));
    } else if (trimmedLine.startsWith('Given') || trimmedLine.startsWith('When') || trimmedLine.startsWith('And')) {
      ({
        currentSteps,
        allExpected,
        testCaseSteps,
      } = await handleStepLine(trimmedLine, currentSteps, allExpected, testCaseSteps));
    } else if (trimmedLine.startsWith('Then')) {
      ({
        readyToPush,
        allExpected,
        ScenarioToPrint,
      } = await handleThenLine(trimmedLine, allExpected, ScenarioToPrint, currentScenario));
    }
  }
  await processLastTestcase(
    currentSteps,
    allExpected,
    ScenarioToPrint,
    testCaseSteps,
    itemType,
    itemId,
    token,
    currentScenario,
    rootPath,
    notes,
    executionMethod
  );
}

/**
 * Sends test cases to SEALM by converting test files to feature files, obtaining an access token,
 * processing feature files, and updating project IDs in feature files.
 *
 * @param rootPath - The root path where the test files and configuration files are located.
 * @returns A Promise that resolves when the process is complete.
 */
export async function sendTestCaseToSealm(rootPath: string): Promise<void> {
  try {
    // Convert to feature file
    await convertAllTests(rootPath);

    // Get access token
    const sealmToken = await getAccessToken(rootPath);

    // Process feature files
    const featureFiles = getAllFiles('./packages/gv-test-cases/sealm/features', '.feature');
    for (const file of featureFiles) {
      await processFeatureFile(file, sealmToken, rootPath);
    }

    // Update project ID's in feature files
    await convertAllTests(rootPath);
  } catch (err) {
    console.error('Error:', err);
  }
}
