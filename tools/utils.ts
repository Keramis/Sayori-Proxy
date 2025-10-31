/**
 * Utility functions file
 */

function hasNonLatinChars(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

export function checkStringValidity(str: any): {valid: boolean; error?: string} {
    if (typeof str !== 'string') {
        return {valid: false, error: "Name must be a valid string"};
    }
    if (str.trim().length === 0) {
        return {valid: false, error: "Name cannot be empty"};
    }
    if (hasNonLatinChars(str)) {
        return {valid: false, error: "Name cannot have weird characters"};   
    }
    return {valid: true};
}