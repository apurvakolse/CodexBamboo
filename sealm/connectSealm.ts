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
import { request, APIRequestContext } from '@playwright/test';
import * as path from 'path';

import { getAllTestFiles } from './getAllTestFiles';
import { findTestCaseAndupdate } from './manageTestID';
import { readPropertyFile, getConfigFilePath } from './readProperties';

/**
 * Creates a new API request context with specific settings.
 *
 * @returns  A promise that resolves to an APIRequestContext instance.
 *
 * @remarks
 * This function creates a new API request context with the option to ignore HTTPS errors.
 * This can be useful when working with self-signed certificates or other SSL issues during development.
 */
async function createApiRequestContext(): Promise<APIRequestContext> {
  return request.newContext({ ignoreHTTPSErrors: true }); // Ignore SSL errors
}

/**
 * Posts the test case in SEALM.
 * @param testCasePayload - Body of the API request.
 * @param token - SEALM auth token.
 * @param rootPath - this will be passed from the actual project which is using this library to refer the root path.
 */
async function uploadTestCase(testCasePayload: string, token: string, rootPath: string): Promise<void> {
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const baseURL = config['sealm.baseUrl']; // For uploading test case
  const apiRequest = await createApiRequestContext(); // Ignore SSL errors
  const response = await apiRequest.post(baseURL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: testCasePayload,
  });

  if (!response.ok()) {
    console.error('❌Failed to upload test case:', response.status(), await response.text());
    return;
  }

  if (response.ok()) {
    let data = await response.json(); // Await the JSON parsing
    console.log('✅Test case uploaded successfully:', data);
    let id = data.meta.id;
    const urlForTc = `${config['sealm.baseUrl']}/${id}`;
    const apiRequest2 = await createApiRequestContext();
    const tcResponse = await apiRequest2.get(urlForTc, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    let jsonData = await tcResponse.json();

    console.log('projectId is: ', jsonData.data.documentKey);
    console.log('testCase name is: ', jsonData.data.fields.name);
    const TEST_ROOT = path.join(rootPath, '../test-scripts/src');
    const testFiles = getAllTestFiles(TEST_ROOT);

    await findTestCaseAndupdate(testFiles, jsonData.data.fields.name, jsonData.data.documentKey, rootPath);
  }
}

/**
 * Gets itemTypeId of the test folder from SEALM using the itemId.
 * @param itemId - ItemId of the test folder in SEALM.
 * @param token - SEALM auth token.
 * @param filePath - Path to the file.
 * @param rootPath - this will be passed from the actual project which is using this library to refer the root path.
 */
async function getItemTypeId(itemId: string, token: string, filePath: string, rootPath: string): Promise<string | null> {
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const baseURL = `${config['sealm.baseUrl']}/${itemId}`; // To get itemType
  const apiRequest =  await createApiRequestContext();
  const response = await apiRequest.get(baseURL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  let jsonData = await response.json();
  if (jsonData.meta.status === 'Not Found' || jsonData.meta.status === 'Bad request') {
    console.log(`❌Cannot find the id- Please check the folder in SEALM- ${filePath}`);
    return null;
  }
  if (jsonData.meta.status === 'Bad Request') {
    console.log(`❌Wrong SEALM Id on your feature file- ${filePath}`);
    return null;
  }
  return jsonData.data.childItemType;
}

/**
 * Gets the test case ID from the item ID.
 * @param itemId - Item ID.
 * @param token - SEALM auth token.
 * @param documentKey - Document key.
 * @param rootPath - this will be passed from the actual project which is using this library to refer the root path.
 */
async function getTestCaseIdFromItemId(itemId: string|null, token: string, documentKey: string, rootPath: string): Promise<string | null> {
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const baseURL = `${config['sealm.baseUrl']}/${itemId}/children`; // To get complete data under this itemid
  const apiRequest = await createApiRequestContext();
  const response = await apiRequest.get(baseURL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const jsonData = await response.json();
  const item = jsonData.data.find((findItem: any) => findItem.documentKey === documentKey);
  return item ? item.id : null;
}

/**
 * Updates the test case in SEALM.
 * @param testCasePayload - Body of the API request.
 * @param token - SEALM auth token.
 * @param testcaseItemId - Test case item ID.
 * @param rootPath - this will be passed from the actual project which is using this library to refer the root path.
 */
async function updateTestCase(testCasePayload: string, token: string, testcaseItemId: string|null, rootPath: string): Promise<void> {
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const testUpdateURL = `${config['sealm.baseUrl']}/${testcaseItemId}`;
  const apiRequest = await createApiRequestContext();
  const response = await apiRequest.put(testUpdateURL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: testCasePayload,
  });

  if (!response.ok()) {
    console.error('❌Failed to update test case:', response.status(), await response.text());
    return;
  }

  if (response.ok()) {
    console.log('⛳ Test case updated successfully:', await response.json());
    const urlForTc = `${config['sealm.baseUrl']}/${testcaseItemId}`;
    const apiRequest2 =  await createApiRequestContext(); // Ignore SSL errors
    const tcResponse = await apiRequest2.get(urlForTc, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    let jsonData = await tcResponse.json();

    console.log('projectId is: ', jsonData.data.documentKey);
    console.log('testCase name is: ', jsonData.data.fields.name);
    const TEST_ROOT = path.join(rootPath, '../test-scripts/src');
    const testFiles = getAllTestFiles(TEST_ROOT);

    await findTestCaseAndupdate(testFiles, jsonData.data.fields.name, jsonData.data.documentKey, rootPath, true);
  }
}
export { uploadTestCase, getItemTypeId, getTestCaseIdFromItemId, updateTestCase };
