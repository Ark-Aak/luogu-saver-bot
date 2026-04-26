export function maskEmail(email: string): string {
    const atIndex = email.indexOf('@');
    if (atIndex <= 0) {
        return email;
    }

    const name = email.slice(0, atIndex);
    const suffix = email.slice(atIndex);
    if (name.length <= 2) {
        return `${name}${suffix}`;
    }

    return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}${suffix}`;
}
