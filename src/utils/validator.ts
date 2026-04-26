import { isValidUserTarget } from '@/utils/user-target';

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

export function isValidSaverToken(token: string): boolean {
    const tokenRegex = /^[0-9a-f]{32}$/;
    return tokenRegex.test(token);
}

export function isValidVerificationCode(code: string): boolean {
    const codeRegex = /^[A-Z0-9]{6}$/;
    return codeRegex.test(code);
}

export function isValidInteger(str: string): boolean {
    const intRegex = /^-?\d+$/;
    return intRegex.test(str);
}

export function isValidPositiveInteger(str: string): boolean {
    const posIntRegex = /^\d+$/;
    return posIntRegex.test(str);
}

export function isValidPositiveId(str: string): boolean {
    const idRegex = /^[1-9]\d*$/;
    return idRegex.test(str);
}

export function isValidUser(userId: string): boolean {
    return isValidUserTarget(userId);
}
