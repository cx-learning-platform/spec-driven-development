// Node.js built-in module types
declare module 'fs' {
    export function readdirSync(path: string): string[];
    export function readFileSync(path: string, encoding: string): string;
    export function existsSync(path: string): boolean;
}

declare module 'path' {
    export function join(...paths: string[]): string;
    export function basename(path: string): string;
    export function extname(path: string): string;
}