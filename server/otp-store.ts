// server/otp-store.ts
export const tempOTPs: Record<string, { otp: string, expires: number }> = {};