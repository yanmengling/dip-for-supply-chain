/**
 * Fuzzy Matching Utility for Material Names
 * 
 * Matches material name variations in user queries to actual material names in entity data.
 */

import type { Material } from '../types/ontology';

// Alias mappings for material name variations
const materialAliases: Record<string, string[]> = {
  '北斗定位模块': ['GPS定位器', '北斗接收模块', 'RTK定位板'],
  // Additional aliases can be added as needed
};

/**
 * Fuzzy matches material names based on query string
 * 
 * @param query - User query string
 * @param materials - Array of materials to search
 * @returns Array of matching materials
 */
export const fuzzyMatchMaterialName = (
  query: string,
  materials: Material[]
): Material[] => {
  const queryLower = query.trim().toLowerCase();
  const matches: Material[] = [];

  // Step 1: Check direct matches (case-insensitive substring)
  materials.forEach(material => {
    const materialNameLower = material.materialName.toLowerCase();
    if (materialNameLower.includes(queryLower) || queryLower.includes(materialNameLower)) {
      if (!matches.includes(material)) {
        matches.push(material);
      }
    }
  });

  // Step 2: Check alias mappings
  Object.entries(materialAliases).forEach(([alias, names]) => {
    const aliasLower = alias.toLowerCase();
    if (queryLower.includes(aliasLower) || aliasLower.includes(queryLower)) {
      materials.forEach(material => {
        if (names.includes(material.materialName) && !matches.includes(material)) {
          matches.push(material);
        }
      });
    }
  });

  return matches;
};

