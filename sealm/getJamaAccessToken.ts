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

import { request } from '@playwright/test';

import { readPropertyFile, getConfigFilePath } from './readProperties';

/**
 * Fetches an access token from the SEALM token URL using client credentials.
 * The function reads the necessary configuration from a properties file and performs an HTTP POST request to obtain the token.
 *
 * @param rootPath - The root path where the configuration properties file is located.
 * @returns A Promise that resolves with the access token as a string.
 */
async function getAccessToken(rootPath: string): Promise<string> {
  const propertyFilePath = getConfigFilePath(rootPath);
  const config = readPropertyFile(propertyFilePath);
  const tokenUrl = config['sealm.tokenUrl'];
  const clientId = config['sealm.clientID'];
  const clientSecret = config['sealm.clientSecret'];
  const encodedCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const apiRequest = await request.newContext({ ignoreHTTPSErrors: true }); // Ignore SSL errors
  const response = await apiRequest.post(tokenUrl, {
    headers: {
      'Authorization': `Basic ${encodedCredentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    form: {
      grant_type: 'client_credentials',
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to fetch access token: ${response.status()} ${await response.text()}`);
  }

  const responseBody = await response.json();
  // console.log('Access Token:', responseBody.access_token);
  return responseBody.access_token;
}

export { getAccessToken };
