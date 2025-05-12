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

/**
 * Recursively finds all TypeScript test files inside a given directory.
 * @param dir - The directory to scan.
 * @param [relativePath=''] - The relative path from the base directory.
 * @returns - List of file paths relative to TEST_ROOT.
 */
function getAllTestFiles(dir: string, relativePath: string = ''): string[] {
  let files: string[] = [];
  const dirPath = path.join(dir, relativePath);
  fs.readdirSync(dirPath).forEach(file => {
    const fullPath = path.join(dirPath, file);
    const relPath = path.join(relativePath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(getAllTestFiles(dir, relPath)); // Recurse into subdirectories
    } else if (file.endsWith('.ts')) {
      files.push(relPath);
    }
  });
  return files;
}

export { getAllTestFiles };
