import OpenAI from 'openai';

/**
 * Summarizes large module documentation using LLM.
 * Used for very large modules that exceed token limits even after optimization.
 */
export class ModuleSummarizer {
    private openai: OpenAI | null = null;
    private readonly model: string = 'gpt-4o-mini'; // Cost-effective model for summarization
    private readonly maxTokens: number = 4000; // Summary should be ~4000 tokens max

    constructor(apiKey?: string) {
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        } else {
            const envKey = process.env.OPENAI_API_KEY;
            if (envKey) {
                this.openai = new OpenAI({ apiKey: envKey });
            } else {
                console.warn('[ModuleSummarizer] OpenAI API key not provided. Summarization will not work.');
            }
        }
    }

    /**
     * Summarizes module documentation for embedding.
     * Preserves: Structure, interface/method names, key signatures, important comments.
     * Removes: Detailed tables, repetitive code blocks, verbose descriptions.
     * 
     * @param content Full markdown content
     * @param filePath File path for context
     * @returns Summarized content optimized for embedding
     */
    async summarizeModuleContent(content: string, filePath: string): Promise<string> {
        if (!this.openai) {
            throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
        }

        if (!content || content.trim().length === 0) {
            throw new Error(`Empty content for file ${filePath}`);
        }

        const prompt = `You are a documentation optimizer for code embeddings. Your task is to summarize this module documentation while preserving all information needed for semantic search.

PRESERVE:
- All headers (#, ##, ###)
- All interface, class, method, and variable names
- All code signatures (first line of code blocks)
- Important comments (especially change markers like <!-- change: ... -->)
- Module structure and organization

REMOVE or SUMMARIZE:
- Detailed property/parameter tables (keep only names, not full tables)
- Repetitive code blocks (keep only signatures)
- Verbose descriptions (keep only key points)
- Long lists (summarize)

Output format: Markdown, same structure as input, but optimized for embedding.

Module documentation:
\`\`\`
${content}
\`\`\`

Optimized summary:`;

        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a documentation optimizer. Summarize module documentation for embeddings while preserving semantic meaning and structure.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3, // Low temperature for consistent summarization
                max_tokens: this.maxTokens
            });

            const summary = response.choices[0]?.message?.content;
            if (!summary) {
                throw new Error('No summary returned from OpenAI');
            }

            return summary;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to summarize module content for ${filePath}: ${errorMessage}`);
        }
    }

    /**
     * Checks if OpenAI API is configured.
     */
    isConfigured(): boolean {
        return this.openai !== null;
    }
}

