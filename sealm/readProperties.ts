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

interface Properties {
    [key: string]: string;
}

/**
 * Reads a property file and returns the configuration as an object.
 * @param filePath - The path to the property file.
 * @returns - An object containing the key-value pairs from the property file.
 */
function readPropertyFile(filePath: string): Properties {
  const properties: Properties = {};
  const data = fs.readFileSync(filePath, 'utf8');

  data.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine !== null && !trimmedLine.startsWith('#')) { // Ignore empty lines and comments
      const [key, value] = trimmedLine.split('=');
      if (key !== null && value !== null) {
        properties[key.trim()] = value.trim();
      }
    }
  });

  return properties;
}

function getConfigFilePath(rootPath: string): string {
  return path.join(rootPath, 'config.properties');
}
export { readPropertyFile, getConfigFilePath };
