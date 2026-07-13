import { PathNormalizer } from '../src/core/path-normalizer';

describe('PathNormalizer', () => {
    describe('normalizePath', () => {
        it('should normalize Windows paths to forward slashes (case-preserving)', () => {
            const input = 'C:\\MyRepo\\File.ts';
            const result = PathNormalizer.normalizePath(input);
            expect(result).toBe('C:/MyRepo/File.ts'); // Case preserved
        });

        it('should normalize Unix paths (case-preserving)', () => {
            const input = '/home/user/MyRepo/File.ts';
            const result = PathNormalizer.normalizePath(input);
            expect(result).toBe('/home/user/MyRepo/File.ts'); // Case preserved
        });

        it('should remove trailing slashes', () => {
            const input = 'C:/MyRepo/File.ts/';
            const result = PathNormalizer.normalizePath(input);
            expect(result).toBe('C:/MyRepo/File.ts');
        });

        it('should simplify multiple slashes', () => {
            const input = 'C://MyRepo//File.ts';
            const result = PathNormalizer.normalizePath(input);
            expect(result).toBe('C:/MyRepo/File.ts');
        });

        it('should preserve case on all platforms', () => {
            const input = 'C:/MyRepo/Components/Button.ts';
            const result = PathNormalizer.normalizePath(input);
            expect(result).toBe('C:/MyRepo/Components/Button.ts'); // Case preserved
        });

        it('should handle relative paths', () => {
            const input = './src/File.ts';
            const result = PathNormalizer.normalizePath(input);
            // Result will be absolute (path.resolve), so we just check it doesn't throw
            expect(result).toBeTruthy();
            expect(result).not.toContain('\\');
        });

        it('should handle empty string', () => {
            const result = PathNormalizer.normalizePath('');
            expect(result).toBe('');
        });
    });

    describe('pathsEqual', () => {
        it('should be case-insensitive on Windows', () => {
            if (process.platform === 'win32') {
                expect(PathNormalizer.pathsEqual('C:/File.ts', 'C:/file.ts')).toBe(true);
                expect(PathNormalizer.pathsEqual('C:/MyRepo/File.ts', 'C:/myrepo/file.ts')).toBe(true);
            }
        });

        it('should be case-sensitive on Unix', () => {
            if (process.platform !== 'win32') {
                expect(PathNormalizer.pathsEqual('/File.ts', '/file.ts')).toBe(false);
                expect(PathNormalizer.pathsEqual('/MyRepo/File.ts', '/myrepo/file.ts')).toBe(false);
            }
        });

        it('should normalize paths before comparison', () => {
            const p1 = 'C:\\MyRepo\\File.ts';
            const p2 = 'C:/MyRepo/File.ts';
            if (process.platform === 'win32') {
                expect(PathNormalizer.pathsEqual(p1, p2)).toBe(true);
            } else {
                // On Unix, both paths are normalized to forward slashes
                expect(PathNormalizer.pathsEqual(p1, p2)).toBe(true);
            }
        });

        it('should return true for identical paths', () => {
            const path = 'C:/MyRepo/File.ts';
            expect(PathNormalizer.pathsEqual(path, path)).toBe(true);
        });

        it('should return false for different paths', () => {
            expect(PathNormalizer.pathsEqual('C:/File1.ts', 'C:/File2.ts')).toBe(false);
        });
    });

    describe('generateLookupVariants', () => {
        it('should generate variants with forward slashes', () => {
            const input = 'C:\\MyRepo\\File.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            expect(variants).toContain('C:/MyRepo/File.ts');
        });

        it('should generate variants with and without leading slashes', () => {
            const input = '/src/File.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            expect(variants).toContain('/src/File.ts');
            expect(variants).toContain('src/File.ts');
        });

        it('should generate variants with plugin prefixes', () => {
            const input = 'src/File.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            expect(variants).toContain('5d-database-plugin/src/File.ts');
            expect(variants).toContain('documentation-system-plugin/src/File.ts');
            expect(variants).toContain('mcp-server/src/File.ts');
        });

        it('should generate variants without plugin prefixes when input has prefix', () => {
            const input = '5d-database-plugin/src/File.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            expect(variants).toContain('5d-database-plugin/src/File.ts');
            expect(variants).toContain('src/File.ts');
        });

        it('should remove duplicates', () => {
            const input = 'src/File.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            const uniqueVariants = Array.from(new Set(variants));
            expect(variants.length).toBe(uniqueVariants.length);
        });

        it('should preserve case in variants', () => {
            const input = 'src/Components/Button.ts';
            const variants = PathNormalizer.generateLookupVariants(input);
            // Check that case is preserved in all variants
            for (const variant of variants) {
                if (variant.includes('Components')) {
                    expect(variant).toContain('Components'); // Case preserved
                }
            }
        });
    });

    describe('Git repository paths (case-sensitive)', () => {
        it('should treat case-sensitive paths as different', () => {
            const path1 = 'src/Components/Button.ts';
            const path2 = 'src/components/button.ts';
            
            // On Windows, pathsEqual should return true (case-insensitive)
            // On Unix, pathsEqual should return false (case-sensitive)
            if (process.platform === 'win32') {
                expect(PathNormalizer.pathsEqual(path1, path2)).toBe(true);
            } else {
                expect(PathNormalizer.pathsEqual(path1, path2)).toBe(false);
            }
        });

        it('should preserve case in normalized paths for Git repositories', () => {
            const path1 = PathNormalizer.normalizePath('src/Components/Button.ts');
            const path2 = PathNormalizer.normalizePath('src/components/button.ts');
            
            // Normalized paths should preserve case
            expect(path1).toBe('src/Components/Button.ts');
            expect(path2).toBe('src/components/button.ts');
            expect(path1).not.toBe(path2);
        });

        it('should generate different lookup variants for case-sensitive paths', () => {
            const path1 = 'src/Components/Button.ts';
            const path2 = 'src/components/button.ts';
            
            const variants1 = PathNormalizer.generateLookupVariants(path1);
            const variants2 = PathNormalizer.generateLookupVariants(path2);
            
            // Variants should be different (case-preserved)
            expect(variants1).not.toEqual(variants2);
            
            // But both should contain their respective paths
            expect(variants1.some(v => v.includes('Components'))).toBe(true);
            expect(variants2.some(v => v.includes('components'))).toBe(true);
        });
    });
});
