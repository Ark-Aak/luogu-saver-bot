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
