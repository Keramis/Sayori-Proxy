/**
 * Utility functions file
*/

import { Request } from "express";

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

// Helper function to get real client IP address
export function getClientIP(req: Request): string {
  // Cloudflare-specific header (most reliable if behind Cloudflare)
  const cfConnectingIP = req.get('cf-connecting-ip');
  
  // Standard proxy headers
  const forwardedFor = req.get('x-forwarded-for');
  const realIP = req.get('x-real-ip');
  const clientIP = req.get('x-client-ip');
  
  // Priority: Cloudflare > X-Forwarded-For > X-Real-IP > X-Client-IP > req.ip
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  if (forwardedFor) {
    // X-Forwarded-For can be: "client, proxy1, proxy2"
    return forwardedFor.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (clientIP) {
    return clientIP;
  }
  
  return req.ip || 'unknown';
}

