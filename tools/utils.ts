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

// Helper function to detect if an IP is IPv4 or IPv6
export function detectIPVersion(ip: string): 'ipv4' | 'ipv6' | 'unknown' {
  if (!ip || ip === 'unknown') return 'unknown';
  
  // IPv4 pattern: xxx.xxx.xxx.xxx
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return 'ipv4';
  }
  
  // IPv6 pattern: contains colons
  if (ip.includes(':')) {
    return 'ipv6';
  }
  
  return 'unknown';
}

// Helper function to normalize IPv4-mapped IPv6 addresses
export function normalizeIP(ip: string): string {
  if (!ip) return ip;
  
  // Convert IPv4-mapped IPv6 to IPv4: ::ffff:192.0.2.1 -> 192.0.2.1
  if (ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  
  // Convert IPv4-compatible IPv6 to IPv4: ::192.0.2.1 -> 192.0.2.1
  if (ip.startsWith('::') && !ip.includes(':', 2)) {
    const ipv4Part = ip.substring(2);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ipv4Part)) {
      return ipv4Part;
    }
  }
  
  return ip;
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
  let ip = cfConnectingIP ||
           (forwardedFor ? forwardedFor.split(',')[0].trim() : null) ||
           realIP ||
           clientIP ||
           req.ip ||
           'unknown';
  
  // Normalize IPv4-mapped IPv6 addresses
  return normalizeIP(ip);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function countInputTokens(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  const messageText = JSON.stringify(messages);
  return estimateTokens(messageText);
}

