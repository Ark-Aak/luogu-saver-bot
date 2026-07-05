import { AnyRngdleRule, defineRule, RngdleContext } from '@/utils/rngdle/types';

function isPrime(value: number): boolean {
    if (value < 2) return false;
    if (value === 2) return true;
    if (value % 2 === 0) return false;
    for (let factor = 3; factor * factor <= value; factor += 2) {
        if (value % factor === 0) return false;
    }
    return true;
}

function isSquare(value: number): boolean {
    const root = Math.floor(Math.sqrt(value));
    return root * root === value;
}

function isCube(value: number): boolean {
    const root = Math.round(Math.cbrt(value));
    return root ** 3 === value;
}

function isFourthPower(value: number): boolean {
    if (value < 0) return false;
    const root = Math.round(value ** 0.25);
    return root ** 4 === value;
}

function isPowerOf(value: number, base: number): boolean {
    if (value < 1) return false;
    let current = value;
    while (current % base === 0) {
        current /= base;
    }
    return current === 1;
}

function isFibonacci(value: number): boolean {
    if (value < 0) return false;
    return isSquare(5 * value * value + 4) || isSquare(5 * value * value - 4);
}

function isFactorial(value: number): boolean {
    if (value < 1) return false;
    let current = 1;
    for (let factor = 1; current <= value; factor += 1) {
        current *= factor;
        if (current === value) return true;
    }
    return false;
}

function isPronic(value: number): boolean {
    if (value < 0) return false;
    const root = Math.floor(Math.sqrt(value));
    return root * (root + 1) === value;
}

function isTriangular(value: number): boolean {
    if (value < 0) return false;
    const root = Math.floor((Math.sqrt(8 * value + 1) - 1) / 2);
    return (root * (root + 1)) / 2 === value;
}

function isStrobogrammatic(text: string): boolean {
    const map: Record<string, string> = { '0': '0', '1': '1', '6': '9', '8': '8', '9': '6' };
    return (
        text
            .split('')
            .reverse()
            .map(digit => map[digit] ?? '?')
            .join('') === text
    );
}

function hasRun(text: string, length: number, digit?: string): boolean {
    for (let index = 0; index <= text.length - length; index += 1) {
        const slice = text.slice(index, index + length);
        if (slice.split('').every(char => char === slice[0]) && (!digit || slice[0] === digit)) {
            return true;
        }
    }
    return false;
}

function hasAscendingRun(text: string, length: number): boolean {
    for (let index = 0; index <= text.length - length; index += 1) {
        const digits = text
            .slice(index, index + length)
            .split('')
            .map(Number);
        if (digits.every((digit, digitIndex) => digitIndex === 0 || digit === digits[digitIndex - 1] + 1)) {
            return true;
        }
    }
    return false;
}

function hasDescendingRun(text: string, length: number): boolean {
    for (let index = 0; index <= text.length - length; index += 1) {
        const digits = text
            .slice(index, index + length)
            .split('')
            .map(Number);
        if (digits.every((digit, digitIndex) => digitIndex === 0 || digit === digits[digitIndex - 1] - 1)) {
            return true;
        }
    }
    return false;
}

function isMountain(digits: number[]): boolean {
    const peakIndex = digits.indexOf(Math.max(...digits));
    if (peakIndex <= 0 || peakIndex >= digits.length - 1) return false;
    return digits.every((digit, index) => {
        if (index === 0) return true;
        return index <= peakIndex ? digit > digits[index - 1] : digit < digits[index - 1];
    });
}

function isValley(digits: number[]): boolean {
    const valleyIndex = digits.indexOf(Math.min(...digits));
    if (valleyIndex <= 0 || valleyIndex >= digits.length - 1) return false;
    return digits.every((digit, index) => {
        if (index === 0) return true;
        return index <= valleyIndex ? digit < digits[index - 1] : digit > digits[index - 1];
    });
}

function isValidMonthDay(month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) return false;
    const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= monthLengths[month - 1];
}

function isDateLike(text: string): boolean {
    const mmddyy = isValidMonthDay(Number(text.slice(0, 2)), Number(text.slice(2, 4)));
    const yymmdd = isValidMonthDay(Number(text.slice(2, 4)), Number(text.slice(4, 6)));
    return mmddyy || yymmdd;
}

function contains(text: string, fragment: string): boolean {
    return text.includes(fragment);
}

function exact(value: string): (text: string) => boolean {
    return text => text === value;
}

function exactNumberText(value: number): string {
    return value.toString().padStart(6, '0');
}

function digitCount(context: RngdleContext, digit: string): number {
    return context.stats.digitCounts[digit] ?? 0;
}

export const RNGDLE_RULES: AnyRngdleRule[] = [
    defineRule({
        id: 'even',
        label: 'Even',
        description: 'The number is even.',
        emoji: '⚖️',
        score: 10,
        family: 'parity',
        input: 'number',
        check: number => number % 2 === 0
    }),
    defineRule({
        id: 'odd',
        label: 'Odd',
        description: 'The number is odd.',
        emoji: '⚖️',
        score: 10,
        family: 'parity',
        input: 'number',
        check: number => number % 2 === 1
    }),
    defineRule({
        id: 'tiny',
        label: 'Tiny',
        description: 'Below 001000.',
        emoji: '🪶',
        score: 120,
        family: 'mass',
        input: 'number',
        check: number => number < 1000
    }),
    defineRule({
        id: 'heavy',
        label: 'Heavy',
        description: 'At least 900000.',
        emoji: '🪨',
        score: 120,
        family: 'mass',
        input: 'number',
        check: number => number >= 900000
    }),
    defineRule({
        id: 'high-roller',
        label: 'High Roller',
        description: 'At least 999900.',
        emoji: '📈',
        score: 3000,
        family: 'mass',
        input: 'number',
        check: number => number >= 999900
    }),
    defineRule({
        id: 'low-ball',
        label: 'Low Ball',
        description: 'At most 000099.',
        emoji: '📉',
        score: 300,
        family: 'mass',
        input: 'number',
        check: number => number <= 99
    }),
    defineRule({
        id: 'leading-zero',
        label: 'Leading Zero',
        description: 'Starts with zero.',
        emoji: '0️⃣',
        score: 25,
        family: 'leading-zero',
        input: 'text',
        check: text => text.startsWith('0')
    }),
    defineRule({
        id: 'double-leading-zero',
        label: 'Double Leading Zero',
        description: 'Starts with two zeros.',
        emoji: '0️⃣',
        score: 90,
        family: 'leading-zero',
        input: 'text',
        check: text => text.startsWith('00')
    }),
    defineRule({
        id: 'triple-leading-zero',
        label: 'Triple Leading Zero',
        description: 'Starts with three zeros.',
        emoji: '0️⃣',
        score: 250,
        family: 'leading-zero',
        input: 'text',
        check: text => text.startsWith('000')
    }),
    defineRule({
        id: 'deep-leading-zero',
        label: 'Deep Leading Zero',
        description: 'Starts with four zeros.',
        emoji: '0️⃣',
        score: 900,
        family: 'leading-zero',
        input: 'text',
        check: text => text.startsWith('0000')
    }),
    defineRule({
        id: 'ghost',
        label: 'Ghost',
        description: 'Starts with five zeros.',
        emoji: '👻',
        score: 2500,
        family: 'leading-zero',
        input: 'text',
        check: text => text.startsWith('00000')
    }),
    defineRule({
        id: 'void',
        label: 'The Void',
        description: 'Exactly 000000.',
        emoji: '🕳️',
        score: 100000,
        family: 'leading-zero',
        input: 'text',
        check: exact('000000')
    }),
    defineRule({
        id: 'clean',
        label: 'Clean',
        description: 'Contains no zeroes.',
        emoji: '🧼',
        score: 40,
        input: 'stats',
        check: stats => stats.zeroCount === 0
    }),
    defineRule({
        id: 'deep-void-three',
        label: 'Deep Void',
        description: 'Contains at least three zeroes.',
        emoji: '🕳️',
        score: 180,
        family: 'zero-count',
        input: 'stats',
        check: stats => stats.zeroCount >= 3
    }),
    defineRule({
        id: 'deep-void-four',
        label: 'Deeper Void',
        description: 'Contains at least four zeroes.',
        emoji: '🕳️',
        score: 750,
        family: 'zero-count',
        input: 'stats',
        check: stats => stats.zeroCount >= 4
    }),
    defineRule({
        id: 'deep-void-five',
        label: 'Deepest Void',
        description: 'Contains at least five zeroes.',
        emoji: '🕳️',
        score: 2500,
        family: 'zero-count',
        input: 'stats',
        check: stats => stats.zeroCount >= 5
    }),
    defineRule({
        id: 'binary',
        label: 'Binary',
        description: 'Only uses zeroes and ones.',
        emoji: '💻',
        score: 5000,
        input: 'text',
        check: text => /^[01]+$/.test(text)
    }),
    defineRule({
        id: 'ternary',
        label: 'Ternary',
        description: 'Only uses 0, 1, and 2.',
        emoji: '🔢',
        score: 1000,
        input: 'text',
        check: text => /^[012]+$/.test(text)
    }),
    defineRule({
        id: 'unique-digits',
        label: 'No Repeats',
        description: 'Every digit is different.',
        emoji: '🧩',
        score: 250,
        input: 'stats',
        check: stats => stats.uniqueDigitCount === 6
    }),
    defineRule({
        id: 'all-even-digits',
        label: 'Even Digits',
        description: 'Every digit is even.',
        emoji: '⚖️',
        score: 120,
        family: 'digit-parity',
        input: 'digits',
        check: digits => digits.every(digit => digit % 2 === 0)
    }),
    defineRule({
        id: 'all-odd-digits',
        label: 'Odd Digits',
        description: 'Every digit is odd.',
        emoji: '⚖️',
        score: 120,
        family: 'digit-parity',
        input: 'digits',
        check: digits => digits.every(digit => digit % 2 === 1)
    }),
    defineRule({
        id: 'lucky-sum-seven',
        label: 'Lucky Sum',
        description: 'Digits add up to 7.',
        emoji: '7️⃣',
        score: 400,
        family: 'digit-sum',
        input: 'stats',
        check: stats => stats.digitSum === 7
    }),
    defineRule({
        id: 'meaning-sum',
        label: 'Meaningful Sum',
        description: 'Digits add up to 42.',
        emoji: '🧠',
        score: 2000,
        family: 'digit-sum',
        input: 'stats',
        check: stats => stats.digitSum === 42
    }),
    defineRule({
        id: 'prime',
        label: 'Prime Number',
        description: 'Divisible only by 1 and itself.',
        emoji: '💎',
        score: 600,
        input: 'number',
        check: isPrime
    }),
    defineRule({
        id: 'square',
        label: 'Perfect Square',
        description: 'A whole number squared.',
        emoji: '◼️',
        score: 700,
        family: 'perfect-power',
        input: 'number',
        check: isSquare
    }),
    defineRule({
        id: 'cube',
        label: 'Perfect Cube',
        description: 'A whole number cubed.',
        emoji: '🎲',
        score: 1400,
        family: 'perfect-power',
        input: 'number',
        check: isCube
    }),
    defineRule({
        id: 'fourth-power',
        label: 'Fourth Power',
        description: 'A whole number to the fourth power.',
        emoji: '🌌',
        score: 4000,
        family: 'perfect-power',
        input: 'number',
        check: isFourthPower
    }),
    defineRule({
        id: 'power-of-two',
        label: 'Power of Two',
        description: 'A power of 2.',
        emoji: '2️⃣',
        score: 1800,
        family: 'base-power',
        input: 'number',
        check: number => isPowerOf(number, 2)
    }),
    defineRule({
        id: 'power-of-three',
        label: 'Power of Three',
        description: 'A power of 3.',
        emoji: '3️⃣',
        score: 1600,
        family: 'base-power',
        input: 'number',
        check: number => isPowerOf(number, 3)
    }),
    defineRule({
        id: 'power-of-ten',
        label: 'Power of Ten',
        description: 'A power of 10.',
        emoji: '🔟',
        score: 2000,
        family: 'base-power',
        input: 'number',
        check: number => isPowerOf(number, 10)
    }),
    defineRule({
        id: 'fibonacci',
        label: 'Fibonacci',
        description: 'Appears in the Fibonacci sequence.',
        emoji: '🌀',
        score: 1800,
        input: 'number',
        check: isFibonacci
    }),
    defineRule({
        id: 'factorial',
        label: 'Factorial',
        description: 'Can be written as n!.',
        emoji: '❗',
        score: 6000,
        input: 'number',
        check: isFactorial
    }),
    defineRule({
        id: 'harshad',
        label: 'Harshad',
        description: 'Divisible by the sum of its digits.',
        emoji: '➗',
        score: 160,
        input: 'number',
        check: (number, context) => context.stats.digitSum > 0 && number % context.stats.digitSum === 0
    }),
    defineRule({
        id: 'pronic',
        label: 'Pronic',
        description: 'Can be written as n x (n + 1).',
        emoji: '🔗',
        score: 700,
        input: 'number',
        check: isPronic
    }),
    defineRule({
        id: 'triangular',
        label: 'Triangular',
        description: 'Can form a triangular stack.',
        emoji: '🔺',
        score: 400,
        input: 'number',
        check: isTriangular
    }),
    defineRule({
        id: 'perfect-number',
        label: 'Perfect Number',
        description: 'One of 000006, 000028, 000496, or 008128.',
        emoji: '✨',
        score: 5000,
        input: 'text',
        check: text => ['000006', '000028', '000496', '008128'].includes(text)
    }),
    defineRule({
        id: 'mirror-ends',
        label: 'Mirror Ends',
        description: 'First and last digit match.',
        emoji: '🪞',
        score: 60,
        family: 'bookends',
        input: 'text',
        check: text => text[0] === text[text.length - 1]
    }),
    defineRule({
        id: 'bookends',
        label: 'Bookends',
        description: 'First two digits match the last two digits.',
        emoji: '📚',
        score: 300,
        family: 'bookends',
        input: 'text',
        check: text => text.slice(0, 2) === text.slice(-2)
    }),
    defineRule({
        id: 'paired-bookends',
        label: 'Paired Bookends',
        description: 'First three digits match the last three digits.',
        emoji: '📚',
        score: 1000,
        family: 'bookends',
        input: 'text',
        check: text => text.slice(0, 3) === text.slice(3)
    }),
    defineRule({
        id: 'palindrome',
        label: 'Palindrome',
        description: 'Reads the same forward and backward.',
        emoji: '🪞',
        score: 5000,
        family: 'symmetry',
        input: 'text',
        check: text => text === text.split('').reverse().join('')
    }),
    defineRule({
        id: 'strobogrammatic',
        label: 'Strobogrammatic',
        description: 'Still works when turned upside down.',
        emoji: '🙃',
        score: 7000,
        family: 'symmetry',
        input: 'text',
        check: isStrobogrammatic
    }),
    defineRule({
        id: 'balanced',
        label: 'Balanced',
        description: 'The first half and second half have equal digit sums.',
        emoji: '⚖️',
        score: 800,
        input: 'stats',
        check: stats => stats.firstHalfSum === stats.secondHalfSum
    }),
    defineRule({
        id: 'pair',
        label: 'Pair',
        description: 'Some digit appears at least twice.',
        emoji: '👥',
        score: 40,
        family: 'of-a-kind',
        input: 'stats',
        check: stats => stats.maxDigitCount >= 2
    }),
    defineRule({
        id: 'trips',
        label: 'Trips',
        description: 'Some digit appears at least three times.',
        emoji: '🎰',
        score: 300,
        family: 'of-a-kind',
        input: 'stats',
        check: stats => stats.maxDigitCount >= 3
    }),
    defineRule({
        id: 'quads',
        label: 'Quads',
        description: 'Some digit appears at least four times.',
        emoji: '🎰',
        score: 1600,
        family: 'of-a-kind',
        input: 'stats',
        check: stats => stats.maxDigitCount >= 4
    }),
    defineRule({
        id: 'fives',
        label: 'Fives',
        description: 'Some digit appears at least five times.',
        emoji: '🎰',
        score: 8000,
        family: 'of-a-kind',
        input: 'stats',
        check: stats => stats.maxDigitCount >= 5
    }),
    defineRule({
        id: 'homogeneous',
        label: 'Homogeneous',
        description: 'All six digits are the same.',
        emoji: '📊',
        score: 100000,
        family: 'of-a-kind',
        input: 'stats',
        check: stats => stats.maxDigitCount === 6
    }),
    defineRule({
        id: 'two-pair',
        label: 'Two Pair',
        description: 'At least two different digits appear twice.',
        emoji: '🃏',
        score: 180,
        family: 'pair-count',
        input: 'stats',
        check: stats => stats.pairCount >= 2
    }),
    defineRule({
        id: 'three-pair',
        label: 'Three Pair',
        description: 'Three different digits appear twice.',
        emoji: '🃏',
        score: 1200,
        family: 'pair-count',
        input: 'stats',
        check: stats => stats.pairCount >= 3
    }),
    defineRule({
        id: 'contiguous-pair',
        label: 'Contiguous Pair',
        description: 'Contains two equal digits in a row.',
        emoji: '🔗',
        score: 60,
        family: 'contiguous-run',
        input: 'stats',
        check: stats => stats.maxRunLength >= 2
    }),
    defineRule({
        id: 'contiguous-trips',
        label: 'Contiguous Trips',
        description: 'Contains three equal digits in a row.',
        emoji: '🔗',
        score: 500,
        family: 'contiguous-run',
        input: 'stats',
        check: stats => stats.maxRunLength >= 3
    }),
    defineRule({
        id: 'contiguous-quads',
        label: 'Contiguous Quads',
        description: 'Contains four equal digits in a row.',
        emoji: '🔗',
        score: 3000,
        family: 'contiguous-run',
        input: 'stats',
        check: stats => stats.maxRunLength >= 4
    }),
    defineRule({
        id: 'contiguous-fives',
        label: 'Contiguous Fives',
        description: 'Contains five equal digits in a row.',
        emoji: '🔗',
        score: 15000,
        family: 'contiguous-run',
        input: 'stats',
        check: stats => stats.maxRunLength >= 5
    }),
    defineRule({
        id: 'contiguous-sixes',
        label: 'Contiguous Sixes',
        description: 'Contains six equal digits in a row.',
        emoji: '🔗',
        score: 100000,
        family: 'contiguous-run',
        input: 'stats',
        check: stats => stats.maxRunLength >= 6
    }),
    defineRule({
        id: 'ascension',
        label: 'Ascension',
        description: 'Contains three ascending digits.',
        emoji: '⬆️',
        score: 300,
        family: 'ascending',
        input: 'text',
        check: text => hasAscendingRun(text, 3)
    }),
    defineRule({
        id: 'cascade',
        label: 'Cascade',
        description: 'Contains four ascending digits.',
        emoji: '⬆️',
        score: 2000,
        family: 'ascending',
        input: 'text',
        check: text => hasAscendingRun(text, 4)
    }),
    defineRule({
        id: 'liftoff',
        label: 'Liftoff',
        description: 'Contains five ascending digits.',
        emoji: '🚀',
        score: 10000,
        family: 'ascending',
        input: 'text',
        check: text => hasAscendingRun(text, 5)
    }),
    defineRule({
        id: 'full-ascension',
        label: 'Full Ascension',
        description: 'All digits ascend in order.',
        emoji: '🚀',
        score: 50000,
        family: 'ascending',
        input: 'text',
        check: text => hasAscendingRun(text, 6)
    }),
    defineRule({
        id: 'decay',
        label: 'Decay',
        description: 'Contains three descending digits.',
        emoji: '⬇️',
        score: 300,
        family: 'descending',
        input: 'text',
        check: text => hasDescendingRun(text, 3)
    }),
    defineRule({
        id: 'waterfall',
        label: 'Waterfall',
        description: 'Contains four descending digits.',
        emoji: '⬇️',
        score: 2000,
        family: 'descending',
        input: 'text',
        check: text => hasDescendingRun(text, 4)
    }),
    defineRule({
        id: 'freefall',
        label: 'Freefall',
        description: 'Contains five descending digits.',
        emoji: '🪂',
        score: 10000,
        family: 'descending',
        input: 'text',
        check: text => hasDescendingRun(text, 5)
    }),
    defineRule({
        id: 'full-decay',
        label: 'Full Decay',
        description: 'All digits descend in order.',
        emoji: '🪂',
        score: 50000,
        family: 'descending',
        input: 'text',
        check: text => hasDescendingRun(text, 6)
    }),
    defineRule({
        id: 'alternator',
        label: 'Alternator',
        description: 'Repeats an ABABAB pattern.',
        emoji: '🔁',
        score: 5000,
        family: 'alternating',
        input: 'text',
        check: text =>
            text[0] !== text[1] &&
            text[0] === text[2] &&
            text[2] === text[4] &&
            text[1] === text[3] &&
            text[3] === text[5]
    }),
    defineRule({
        id: 'zipper',
        label: 'Zipper',
        description: 'Alternates up and down every digit.',
        emoji: '🤐',
        score: 1500,
        family: 'alternating',
        input: 'digits',
        check: digits =>
            digits.every((digit, index) => {
                if (index < 2) return true;
                const previousDiff = digits[index - 1] - digits[index - 2];
                const currentDiff = digit - digits[index - 1];
                return previousDiff !== 0 && currentDiff !== 0 && Math.sign(previousDiff) !== Math.sign(currentDiff);
            })
    }),
    defineRule({
        id: 'mountain',
        label: 'Mountain',
        description: 'Digits climb up and then descend.',
        emoji: '⛰️',
        score: 1500,
        family: 'terrain',
        input: 'digits',
        check: isMountain
    }),
    defineRule({
        id: 'valley',
        label: 'Valley',
        description: 'Digits descend and then climb up.',
        emoji: '🏞️',
        score: 1500,
        family: 'terrain',
        input: 'digits',
        check: isValley
    }),
    defineRule({
        id: 'lucky-seven',
        label: 'Lucky Seven',
        description: 'Contains a 7.',
        emoji: '7️⃣',
        score: 60,
        family: 'sevens',
        input: 'text',
        check: text => contains(text, '7')
    }),
    defineRule({
        id: 'double-seven',
        label: 'Double Seven',
        description: 'Contains at least two 7s.',
        emoji: '7️⃣',
        score: 180,
        family: 'sevens',
        input: 'context',
        check: context => digitCount(context, '7') >= 2
    }),
    defineRule({
        id: 'jackpot',
        label: 'Jackpot',
        description: 'Contains 777.',
        emoji: '💰',
        score: 2000,
        family: 'sevens',
        input: 'text',
        check: text => contains(text, '777')
    }),
    defineRule({
        id: 'jackpot-four',
        label: 'Jackpot Four',
        description: 'Contains 7777.',
        emoji: '💰',
        score: 10000,
        family: 'sevens',
        input: 'text',
        check: text => contains(text, '7777')
    }),
    defineRule({
        id: 'jackpot-five',
        label: 'Jackpot Five',
        description: 'Contains 77777.',
        emoji: '💰',
        score: 50000,
        family: 'sevens',
        input: 'text',
        check: text => contains(text, '77777')
    }),
    defineRule({
        id: 'jackpot-six',
        label: 'Jackpot Six',
        description: 'Exactly 777777.',
        emoji: '🏦',
        score: 100000,
        family: 'sevens',
        input: 'text',
        check: exact('777777')
    }),
    defineRule({
        id: 'snake-eyes',
        label: 'Snake Eyes',
        description: 'Contains 11.',
        emoji: '🐍',
        score: 50,
        input: 'text',
        check: text => contains(text, '11')
    }),
    defineRule({
        id: 'blackjack',
        label: 'Blackjack',
        description: 'Contains 21.',
        emoji: '🃏',
        score: 50,
        input: 'text',
        check: text => contains(text, '21')
    }),
    defineRule({
        id: 'nice',
        label: 'Nice',
        description: 'Contains 69.',
        emoji: '😏',
        score: 690,
        family: 'nice',
        input: 'text',
        check: text => contains(text, '69')
    }),
    defineRule({
        id: 'exact-nice',
        label: 'Exact Nice',
        description: 'Exactly 000069.',
        emoji: '😏',
        score: 50000,
        family: 'nice',
        input: 'text',
        check: exact(exactNumberText(69))
    }),
    defineRule({
        id: 'botanist',
        label: 'Botanist',
        description: 'Contains 420.',
        emoji: '🌿',
        score: 1000,
        family: 'botanist',
        input: 'text',
        check: text => contains(text, '420')
    }),
    defineRule({
        id: 'exact-botanist',
        label: 'Exact Botanist',
        description: 'Exactly 000420.',
        emoji: '🌿',
        score: 50000,
        family: 'botanist',
        input: 'text',
        check: exact(exactNumberText(420))
    }),
    defineRule({
        id: 'devil',
        label: 'Devil',
        description: 'Contains 666.',
        emoji: '😈',
        score: 1200,
        family: 'devil',
        input: 'text',
        check: text => contains(text, '666')
    }),
    defineRule({
        id: 'exact-devil',
        label: 'Exact Devil',
        description: 'Exactly 000666.',
        emoji: '😈',
        score: 50000,
        family: 'devil',
        input: 'text',
        check: exact(exactNumberText(666))
    }),
    defineRule({
        id: 'leet',
        label: 'Leet',
        description: 'Contains 1337.',
        emoji: '💻',
        score: 2000,
        family: 'leet',
        input: 'text',
        check: text => contains(text, '1337')
    }),
    defineRule({
        id: 'exact-leet',
        label: 'Exact Leet',
        description: 'Exactly 001337.',
        emoji: '💻',
        score: 50000,
        family: 'leet',
        input: 'text',
        check: exact(exactNumberText(1337))
    }),
    defineRule({
        id: 'meaning',
        label: 'Meaning',
        description: 'Contains 42.',
        emoji: '🧠',
        score: 420,
        family: 'meaning',
        input: 'text',
        check: text => contains(text, '42')
    }),
    defineRule({
        id: 'exact-meaning',
        label: 'Exact Meaning',
        description: 'Exactly 000042.',
        emoji: '🧠',
        score: 50000,
        family: 'meaning',
        input: 'text',
        check: exact(exactNumberText(42))
    }),
    defineRule({
        id: 'sixty-seven',
        label: 'Sixty Seven',
        description: 'Contains 67.',
        emoji: '🗣️',
        score: 670,
        family: 'sixty-seven',
        input: 'text',
        check: text => contains(text, '67')
    }),
    defineRule({
        id: 'exact-sixty-seven',
        label: 'Exact Sixty Seven',
        description: 'Exactly 000067.',
        emoji: '🗣️',
        score: 50000,
        family: 'sixty-seven',
        input: 'text',
        check: exact(exactNumberText(67))
    }),
    defineRule({
        id: 'big-brother',
        label: 'Big Brother',
        description: 'Contains 1984.',
        emoji: '👁️',
        score: 1984,
        family: 'big-brother',
        input: 'text',
        check: text => contains(text, '1984')
    }),
    defineRule({
        id: 'exact-big-brother',
        label: 'Exact Big Brother',
        description: 'Exactly 001984.',
        emoji: '👁️',
        score: 50000,
        family: 'big-brother',
        input: 'text',
        check: exact(exactNumberText(1984))
    }),
    defineRule({
        id: 'secret-agent',
        label: 'Secret Agent',
        description: 'Contains 007.',
        emoji: '🕵️',
        score: 700,
        input: 'text',
        check: text => contains(text, '007')
    }),
    defineRule({
        id: 'homo',
        label: 'Homo',
        description: 'Exactly 114514.',
        emoji: '📣',
        score: 100000,
        input: 'text',
        check: exact('114514')
    }),
    defineRule({
        id: 'tree-fiddy',
        label: 'Tree Fiddy',
        description: 'Contains 350.',
        emoji: '🌳',
        score: 350,
        family: 'tree-fiddy',
        input: 'text',
        check: text => contains(text, '350')
    }),
    defineRule({
        id: 'exact-tree-fiddy',
        label: 'Exact Tree Fiddy',
        description: 'Exactly 000350.',
        emoji: '🌳',
        score: 50000,
        family: 'tree-fiddy',
        input: 'text',
        check: exact(exactNumberText(350))
    }),
    defineRule({
        id: 'pi',
        label: 'Pi',
        description: 'Contains 314.',
        emoji: '🥧',
        score: 500,
        family: 'pi',
        input: 'text',
        check: text => contains(text, '314')
    }),
    defineRule({
        id: 'pi-six',
        label: 'Pi Six',
        description: 'Exactly 314159.',
        emoji: '🥧',
        score: 100000,
        family: 'pi',
        input: 'text',
        check: exact('314159')
    }),
    defineRule({
        id: 'euler',
        label: 'Euler',
        description: 'Exactly 271828.',
        emoji: '🧮',
        score: 100000,
        input: 'text',
        check: exact('271828')
    }),
    defineRule({
        id: 'golden-ratio',
        label: 'Golden Ratio',
        description: 'Exactly 161803.',
        emoji: '🌟',
        score: 100000,
        input: 'text',
        check: exact('161803')
    }),
    defineRule({
        id: 'sqrt-two',
        label: 'Root Two',
        description: 'Exactly 141421.',
        emoji: '√',
        score: 100000,
        input: 'text',
        check: exact('141421')
    }),
    defineRule({
        id: 'hell',
        label: 'Hell',
        description: 'Contains calculator word 7734.',
        emoji: '🔥',
        score: 1200,
        family: 'calculator-hell',
        input: 'text',
        check: text => contains(text, '7734')
    }),
    defineRule({
        id: 'exact-hell',
        label: 'Exact Hell',
        description: 'Exactly 007734.',
        emoji: '🔥',
        score: 50000,
        family: 'calculator-hell',
        input: 'text',
        check: exact(exactNumberText(7734))
    }),
    defineRule({
        id: 'boob',
        label: 'Boob',
        description: 'Contains calculator word 8008.',
        emoji: '🔢',
        score: 1200,
        family: 'calculator-boob',
        input: 'text',
        check: text => contains(text, '8008')
    }),
    defineRule({
        id: 'exact-boob',
        label: 'Exact Boob',
        description: 'Exactly 008008.',
        emoji: '🔢',
        score: 50000,
        family: 'calculator-boob',
        input: 'text',
        check: exact(exactNumberText(8008))
    }),
    defineRule({
        id: 'hello',
        label: 'Hello',
        description: 'Contains calculator word 07734.',
        emoji: '👋',
        score: 8000,
        input: 'text',
        check: text => contains(text, '07734')
    }),
    defineRule({
        id: 'calendar',
        label: 'Calendar',
        description: 'Looks like a valid MMDDYY or YYMMDD date.',
        emoji: '📅',
        score: 500,
        input: 'text',
        check: isDateLike
    }),
    defineRule({
        id: 'new-year',
        label: 'New Year',
        description: 'Contains 0101.',
        emoji: '🎆',
        score: 600,
        input: 'text',
        check: text => contains(text, '0101')
    }),
    defineRule({
        id: 'mayday',
        label: 'Mayday',
        description: 'Contains 0501.',
        emoji: '🚨',
        score: 800,
        input: 'text',
        check: text => contains(text, '0501')
    }),
    defineRule({
        id: 'christmas',
        label: 'Christmas',
        description: 'Contains 1225.',
        emoji: '🎄',
        score: 800,
        input: 'text',
        check: text => contains(text, '1225')
    }),
    defineRule({
        id: 'halloween',
        label: 'Halloween',
        description: 'Contains 1031.',
        emoji: '🎃',
        score: 800,
        input: 'text',
        check: text => contains(text, '1031')
    }),
    defineRule({
        id: 'april-fools',
        label: 'April Fools',
        description: 'Contains 0401.',
        emoji: '🃏',
        score: 800,
        input: 'text',
        check: text => contains(text, '0401')
    }),
    defineRule({
        id: 'six-six-six-run',
        label: 'Infernal Run',
        description: 'Contains 666 as a contiguous run.',
        emoji: '🔥',
        score: 666,
        input: 'text',
        check: text => hasRun(text, 3, '6')
    }),
    defineRule({
        id: 'seven-eight-nine-one',
        label: '91 VIP',
        description: 'Contains 7891.',
        emoji: '🥵',
        score: 7891,
        input: 'text',
        check: text => contains(text, '7891')
    }),
    defineRule({
        id: 'dick-lover',
        label: 'Dick Lover',
        description: 'Contains 2778.',
        emoji: '🍆',
        score: 2778,
        input: 'text',
        check: text => contains(text, '2778')
    }),
    defineRule({
        id: 'foodie',
        label: 'Foodie',
        description: 'Exactly 277891.',
        emoji: '😋',
        score: 277891,
        input: 'text',
        check: exact('277891')
    })
];
