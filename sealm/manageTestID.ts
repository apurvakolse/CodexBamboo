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

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Function to check for a particular text in a file.
 * @param filePath - The path to the test.ts file.
 * @param searchText - Test case to be searched in test.ts file.
 * @param id - ID from sealm which needs to update in the test case.
 * @param modified - If the test case is modified, change the @modify tag to ''.
 */
async function checkForTextAndUpdate(filePath: string, searchText: string, id: string, rootPath: string, modified: boolean = false): Promise<void> {
  let fullPath: string | null = null;
  try {
    // Construct the base path dynamically
    const basePath = path.join(rootPath, '../test-scripts/src');
    fullPath = path.join(basePath, filePath);
    let replaceText = '';
    let updatedData = '';
    const data = await fs.readFile(fullPath, 'utf8'); // Read the file content
    if (data.includes(searchText)) {
      if (modified) { // If this is a modified test case, change the @modify tag to ''
        replaceText = searchText.replace(/\s*@modify/g, '');
        updatedData = data.split(searchText).join(replaceText);
      } else {
        replaceText = `@${  id} ${searchText  }`;
        updatedData = data.split(searchText).join(replaceText);
      }

      // Write the updated data back to the file
      await fs.writeFile(fullPath, updatedData, 'utf8');
    } else {
      console.log(`Text not found in ${fullPath}`);
    }
  } catch (error) {
    console.error(`Error reading file ${fullPath}:`, error);
  }
}

/**
 * Function to iterate through each file to update the test case ID from sealm.
 * @param files - Array of file paths to all .ts files.
 * @param searchText - Test case to be searched in the test.ts file.
 * @param id - ID from sealm which needs to update in the test case.
 * @param modified - If the test case is modified, change the @modify tag to ''.
 * @param rootPath - The root path where the configuration properties file is located.
 */
async function findTestCaseAndupdate(files: string[], searchText: string, id: string, rootPath: string, modified: boolean = false): Promise<void> {
  for (const filePath of files) {
    await checkForTextAndUpdate(filePath, searchText, id, rootPath, modified);
  }
}

export { findTestCaseAndupdate };
